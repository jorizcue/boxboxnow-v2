"""REST API routes for log replay control (per-user)."""

import logging
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload
from app.models.database import get_db
from app.models.schemas import RaceSession, Circuit, TeamPosition
from app.api.auth_routes import get_current_user
from app.models.schemas import User
from app.apex.replay import ReplayEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/replay", tags=["replay"])


class ReplayStartRequest(BaseModel):
    filename: str
    speed: float = 1.0
    start_block: int = 0


class ReplaySpeedRequest(BaseModel):
    speed: float


class ReplaySeekRequest(BaseModel):
    block: int


def _get_replay_registry(request: Request):
    return request.app.state.replay_registry


@router.get("/logs")
async def list_logs(request: Request):
    """List available log files for replay."""
    # Use a temporary engine just for listing (no user state needed)
    from app.apex.parser import ApexMessageParser
    engine = ReplayEngine(ApexMessageParser(), lambda e: None, logs_dir="data/logs")
    return {"logs": engine.list_logs()}


@router.get("/analyze/{filename}")
async def analyze_log(filename: str, request: Request):
    """Analyze a log file: total blocks, race start positions, time range."""
    from app.apex.parser import ApexMessageParser
    engine = ReplayEngine(ApexMessageParser(), lambda e: None, logs_dir="data/logs")
    try:
        return engine.analyze_log(filename)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.get("/status")
async def replay_status(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Get current replay status for this user."""
    replay_reg = _get_replay_registry(request)
    replay_session = replay_reg.get(user.id)
    if not replay_session:
        return {"active": False, "filename": None, "progress": 0, "speed": 1.0,
                "paused": False, "currentBlock": 0, "totalBlocks": 0, "currentTime": None}
    return replay_session.engine.status


@router.post("/start")
async def start_replay(
    data: ReplayStartRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start replaying a log file. Creates per-user replay session."""
    replay_reg = _get_replay_registry(request)

    # Stop any existing replay for this user
    await replay_reg.stop_session(user.id)

    # Create a new replay session for this user
    replay_session = replay_reg.get_or_create(user.id)

    # Load user's active session config (with teams and drivers for differentials)
    session = (await db.execute(
        select(RaceSession)
        .options(
            selectinload(RaceSession.team_positions).selectinload(TeamPosition.drivers),
        )
        .where(
            RaceSession.user_id == user.id,
            RaceSession.is_active == True,
        )
    )).scalar_one_or_none()

    # Reset state and apply user config
    replay_session.state.reset()
    if session:
        # Load circuit
        circuit = None
        if session.circuit_id:
            circuit = (await db.execute(
                select(Circuit).where(Circuit.id == session.circuit_id)
            )).scalar_one_or_none()

        replay_session.apply_config(session, circuit)

        # Load team positions and driver differentials for clustering
        team_positions = {}
        driver_differentials = {}
        for tp in session.team_positions:
            team_positions[tp.kart] = tp.position
            if tp.drivers:
                driver_differentials[tp.kart] = {
                    d.driver_name.strip().lower(): d.differential_ms
                    for d in tp.drivers
                }
        replay_session.differentials["team_positions"] = team_positions
        replay_session.differentials["driver_differentials"] = driver_differentials
        logger.info(f"Replay config for user {user.id}: box_karts={replay_session.state.box_karts}, "
                    f"box_lines={replay_session.state.box_lines}, our_kart={replay_session.state.our_kart_number}, "
                    f"teams={len(team_positions)}, "
                    f"drivers_with_diff={sum(1 for d in driver_differentials.values() for v in d.values() if v != 0)}")
    else:
        replay_session.differentials["team_positions"] = {}
        replay_session.differentials["driver_differentials"] = {}

    replay_session.fifo.update_config(replay_session.state.box_karts, replay_session.state.box_lines)
    replay_session.fifo._history.clear()
    replay_session.fifo.apply_to_state(replay_session.state)

    try:
        await replay_session.engine.start(data.filename, data.speed, start_block=data.start_block)
        await replay_session.start_analytics()
        await replay_session.state._broadcast(replay_session.state.get_snapshot())
        return {"status": "started", "filename": data.filename, "speed": data.speed}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.post("/stop")
async def stop_replay(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Stop the current replay for this user."""
    replay_reg = _get_replay_registry(request)
    await replay_reg.stop_session(user.id)
    return {"status": "stopped"}


@router.post("/pause")
async def pause_replay(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Toggle pause/resume on the current replay."""
    replay_reg = _get_replay_registry(request)
    replay_session = replay_reg.get(user.id)
    if not replay_session:
        raise HTTPException(400, "No active replay")
    await replay_session.engine.pause()
    return replay_session.engine.status


@router.post("/seek")
async def seek_replay(
    data: ReplaySeekRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Seek to a specific block in the replay."""
    replay_reg = _get_replay_registry(request)
    replay_session = replay_reg.get(user.id)
    if not replay_session:
        raise HTTPException(400, "No active replay")

    if not replay_session.engine._filename or not replay_session.engine._blocks:
        raise HTTPException(400, "No replay loaded")

    # Reset state and FIFO before seeking
    replay_session.state.reset()
    replay_session.fifo.update_config(replay_session.fifo.queue_size, replay_session.fifo.box_lines)
    replay_session.fifo._history.clear()

    await replay_session.engine.seek(data.block)
    return replay_session.engine.status


@router.post("/speed")
async def set_speed(
    data: ReplaySpeedRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Set replay speed."""
    replay_reg = _get_replay_registry(request)
    replay_session = replay_reg.get(user.id)
    if not replay_session:
        raise HTTPException(400, "No active replay")
    await replay_session.engine.set_speed(data.speed)
    return {"speed": replay_session.engine._speed}
