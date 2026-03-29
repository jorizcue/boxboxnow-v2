"""REST API routes for log replay control."""

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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/replay", tags=["replay"])


class ReplayStartRequest(BaseModel):
    filename: str
    speed: float = 1.0


class ReplaySpeedRequest(BaseModel):
    speed: float


@router.get("/logs")
async def list_logs(request: Request):
    """List available log files for replay."""
    replay = request.app.state.replay_engine
    return {"logs": replay.list_logs()}


@router.get("/status")
async def replay_status(request: Request):
    """Get current replay status."""
    replay = request.app.state.replay_engine
    return replay.status


@router.post("/start")
async def start_replay(
    data: ReplayStartRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start replaying a log file. Loads user's session config for FIFO/stint."""
    replay = request.app.state.replay_engine
    replay_state = request.app.state.replay_state
    replay_fifo = request.app.state.replay_fifo

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
    replay_state.reset()
    if session:
        replay_state.box_karts = session.box_karts or 30
        replay_state.box_lines = session.box_lines or 2
        replay_state.our_kart_number = session.our_kart_number or 0
        replay_state.duration_min = session.duration_min or 180
        replay_state.max_stint_min = session.max_stint_min or 40
        replay_state.min_stint_min = session.min_stint_min or 15
        replay_state.min_pits = session.min_pits or 3
        replay_state.pit_time_s = session.pit_time_s or 120
        replay_state.min_driver_time_min = session.min_driver_time_min or 30
        # Load circuit config if available
        if session.circuit_id:
            circuit = (await db.execute(
                select(Circuit).where(Circuit.id == session.circuit_id)
            )).scalar_one_or_none()
            if circuit:
                replay_state.circuit_length_m = circuit.length_m or 1100
                replay_state.laps_discard = circuit.laps_discard or 2
                replay_state.lap_differential = circuit.lap_differential or 3000
        # Load team positions and driver differentials for clustering
        replay_diffs = request.app.state.replay_differentials
        team_positions = {}
        driver_differentials = {}
        for tp in session.team_positions:
            team_positions[tp.kart] = tp.position
            if tp.drivers:
                driver_differentials[tp.kart] = {
                    d.driver_name.strip().lower(): d.differential_ms
                    for d in tp.drivers
                }
        replay_diffs["team_positions"] = team_positions
        replay_diffs["driver_differentials"] = driver_differentials
        logger.info(f"Replay config from session: box_karts={replay_state.box_karts}, "
                    f"box_lines={replay_state.box_lines}, our_kart={replay_state.our_kart_number}, "
                    f"teams={len(team_positions)}, "
                    f"drivers_with_diff={sum(1 for d in driver_differentials.values() for v in d.values() if v != 0)}")
    else:
        # No session — clear differentials
        replay_diffs = request.app.state.replay_differentials
        replay_diffs["team_positions"] = {}
        replay_diffs["driver_differentials"] = {}

    replay_fifo.update_config(replay_state.box_karts, replay_state.box_lines)
    replay_fifo._history.clear()
    replay_fifo.apply_to_state(replay_state)  # Populate initial FIFO (all 25s) in state

    try:
        await replay.start(data.filename, data.speed)
        await replay_state._broadcast(replay_state.get_snapshot())
        return {"status": "started", "filename": data.filename, "speed": data.speed}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.post("/stop")
async def stop_replay(request: Request):
    """Stop the current replay."""
    replay = request.app.state.replay_engine
    replay_state = request.app.state.replay_state
    replay_fifo = request.app.state.replay_fifo

    await replay.stop()

    # Reset state and FIFO, broadcast so clients see timer reset
    replay_state.reset()
    replay_fifo.update_config(replay_fifo.queue_size, replay_fifo.box_lines)
    replay_fifo._history.clear()
    await replay_state._broadcast(replay_state.get_snapshot())

    return {"status": "stopped"}


@router.post("/pause")
async def pause_replay(request: Request):
    """Toggle pause/resume on the current replay."""
    replay = request.app.state.replay_engine
    await replay.pause()
    return replay.status


@router.post("/speed")
async def set_speed(data: ReplaySpeedRequest, request: Request):
    """Set replay speed."""
    replay = request.app.state.replay_engine
    await replay.set_speed(data.speed)
    return {"speed": replay._speed}
