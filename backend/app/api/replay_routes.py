"""REST API routes for log replay control (per-user).

Supports:
- Circuit recordings (auto-recorded by CircuitHub in data/recordings/{circuit}/)
- Legacy user recordings (data/logs/{user_id}/)
- Legacy root recordings (data/logs/)
"""

import logging
import os
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload
from app.models.database import get_db
from app.models.schemas import RaceSession, Circuit, TeamPosition, User
from app.api.auth_routes import get_current_user
from app.apex.replay import ReplayEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/replay", tags=["replay"])

LOGS_BASE_DIR = "data/logs"
RECORDINGS_BASE_DIR = "data/recordings"


class ReplayStartRequest(BaseModel):
    filename: str
    speed: float = 1.0
    start_block: int = 0
    owner_id: int | None = None  # Admin can replay another user's log
    circuit_dir: str | None = None  # Circuit recording subdirectory


class ReplaySpeedRequest(BaseModel):
    speed: float


class ReplaySeekRequest(BaseModel):
    block: int


def _get_replay_registry(request: Request):
    return request.app.state.replay_registry


def _resolve_logs_dir(user: User, owner_id: int | None = None,
                      circuit_dir: str | None = None) -> str:
    """Resolve the logs directory for a given source.
    - circuit_dir: circuit recording from data/recordings/{circuit_dir}/
    - owner_id (admin): another user's logs from data/logs/{owner_id}/
    - default: user's own logs from data/logs/{user.id}/
    """
    if circuit_dir:
        return os.path.join(RECORDINGS_BASE_DIR, circuit_dir)
    if owner_id is not None and user.is_admin:
        return os.path.join(LOGS_BASE_DIR, str(owner_id))
    return os.path.join(LOGS_BASE_DIR, str(user.id))


def _list_log_files(directory: Path) -> list[Path]:
    """List .log and .log.gz files in a directory."""
    logs = list(directory.glob("*.log"))
    logs += list(directory.glob("*.log.gz"))
    return logs


def _list_user_logs(user_id: int) -> list[dict]:
    """List log files for a specific user."""
    user_dir = Path(os.path.join(LOGS_BASE_DIR, str(user_id)))
    if not user_dir.is_dir():
        return []
    return sorted(
        [
            {"filename": f.name, "owner_id": user_id}
            for f in _list_log_files(user_dir)
        ],
        key=lambda x: x["filename"],
        reverse=True,
    )


def _list_root_logs() -> list[dict]:
    """List legacy log files in root data/logs/ (not in user subdirs)."""
    base = Path(LOGS_BASE_DIR)
    if not base.exists():
        return []
    return sorted(
        [
            {"filename": f.name, "owner_id": None}
            for f in _list_log_files(base)
            if f.is_file()
        ],
        key=lambda x: x["filename"],
        reverse=True,
    )


def _list_circuit_recordings() -> list[dict]:
    """List circuit recordings from data/recordings/{circuit}/."""
    base = Path(RECORDINGS_BASE_DIR)
    if not base.exists():
        return []
    recordings = []
    for circuit_dir in sorted(base.iterdir()):
        if circuit_dir.is_dir():
            for f in sorted(_list_log_files(circuit_dir), reverse=True):
                recordings.append({
                    "filename": f.name,
                    "owner_id": None,
                    "owner": circuit_dir.name,
                    "circuit_dir": circuit_dir.name,
                })
    return recordings


@router.get("/recordings")
async def list_recordings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List available circuit recordings grouped by circuit with dates.
    Non-admin sees only circuits they have access to.
    Admin sees all circuits."""
    from app.models.schemas import UserCircuitAccess
    from datetime import datetime as dt, timezone as tz
    import re

    base = Path(RECORDINGS_BASE_DIR)
    if not base.exists():
        return {"circuits": []}

    # Build map: safe_name -> circuit_dir contents
    all_dirs = {}
    for circuit_dir in sorted(base.iterdir()):
        if circuit_dir.is_dir():
            date_set = set()
            for f in circuit_dir.iterdir():
                name = f.name
                if name.endswith(".log.gz"):
                    stem = name[:-7]  # remove .log.gz
                elif name.endswith(".log"):
                    stem = name[:-4]  # remove .log
                else:
                    continue
                if re.match(r"\d{4}-\d{2}-\d{2}$", stem):
                    date_set.add(stem)
            dates = sorted(date_set, reverse=True)
            if dates:
                all_dirs[circuit_dir.name] = dates

    if not all_dirs:
        return {"circuits": []}

    # Get circuits from DB to map safe_name -> circuit info
    from app.models.schemas import Circuit as CircuitModel
    result = await db.execute(select(CircuitModel))
    db_circuits = result.scalars().all()

    # Build safe_name -> circuit mapping
    from app.apex.circuit_hub import _safe_name
    circuit_map = {}
    for c in db_circuits:
        safe = _safe_name(c.name)
        circuit_map[safe] = {"id": c.id, "name": c.name}

    # Filter by user access if not admin
    allowed_circuit_ids = None
    if not user.is_admin:
        now = dt.now(tz.utc)
        result = await db.execute(
            select(UserCircuitAccess.circuit_id).where(
                UserCircuitAccess.user_id == user.id,
                UserCircuitAccess.valid_from <= now,
                UserCircuitAccess.valid_until >= now,
            )
        )
        allowed_circuit_ids = {row[0] for row in result.all()}

    circuits_out = []
    for dir_name, dates in all_dirs.items():
        info = circuit_map.get(dir_name, {"id": None, "name": dir_name})
        # Filter by access
        if allowed_circuit_ids is not None and info["id"] not in allowed_circuit_ids:
            continue
        circuits_out.append({
            "circuit_dir": dir_name,
            "circuit_name": info["name"],
            "circuit_id": info["id"],
            "dates": dates,
        })

    return {"circuits": circuits_out}


@router.get("/logs")
async def list_logs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List available log files.
    Always includes circuit recordings (auto-recorded by CircuitHub).
    Admin sees all users' logs + legacy root logs.
    Non-admin sees only their own logs."""
    all_logs = []

    # Circuit recordings (available to all users)
    all_logs.extend(_list_circuit_recordings())

    if user.is_admin:
        # Collect logs from all user subdirectories + root
        from app.models.schemas import User as UserModel
        result = await db.execute(select(UserModel))
        users_map = {u.id: u.username for u in result.scalars().all()}

        base = Path(LOGS_BASE_DIR)
        if base.exists():
            for subdir in sorted(base.iterdir()):
                if subdir.is_dir() and subdir.name.isdigit():
                    uid = int(subdir.name)
                    username = users_map.get(uid, f"user_{uid}")
                    for f in sorted(subdir.glob("*.log"), reverse=True):
                        all_logs.append({
                            "filename": f.name,
                            "owner_id": uid,
                            "owner": username,
                        })

        # Legacy root-level logs
        for entry in _list_root_logs():
            all_logs.append({
                "filename": entry["filename"],
                "owner_id": None,
                "owner": "sistema",
            })

        return {"logs": all_logs}
    else:
        # Non-admin: circuit recordings + own logs
        user_logs = _list_user_logs(user.id)
        all_logs.extend([{"filename": l["filename"]} for l in user_logs])
        return {"logs": all_logs}


@router.get("/analyze/{filename}")
async def analyze_log(
    filename: str,
    user: User = Depends(get_current_user),
    owner_id: int | None = Query(None),
    circuit_dir: str | None = Query(None),
):
    """Analyze a log file: total blocks, race start positions, time range."""
    from app.apex.parser import ApexMessageParser

    logs_dir = _resolve_logs_dir(user, owner_id, circuit_dir)

    # Check file exists, fallback to .log.gz or legacy root dir
    filepath = os.path.join(logs_dir, filename)
    if not os.path.exists(filepath):
        gz_path = filepath + ".gz" if not filepath.endswith(".gz") else None
        if gz_path and os.path.exists(gz_path):
            filename = filename + ".gz"
        else:
            root_path = os.path.join(LOGS_BASE_DIR, filename)
            if user.is_admin and os.path.exists(root_path):
                logs_dir = LOGS_BASE_DIR
            else:
                raise HTTPException(404, f"Log file not found: {filename}")

    engine = ReplayEngine(ApexMessageParser(), lambda e: None, logs_dir=logs_dir)
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

    # Resolve which directory to read from
    if data.circuit_dir:
        logs_dir = os.path.join(RECORDINGS_BASE_DIR, data.circuit_dir)
    elif data.owner_id is not None and user.is_admin:
        logs_dir = os.path.join(LOGS_BASE_DIR, str(data.owner_id))
    else:
        logs_dir = os.path.join(LOGS_BASE_DIR, str(user.id))

    # Check file exists (also check .log.gz fallback or root for legacy)
    filepath = os.path.join(logs_dir, data.filename)
    if not os.path.exists(filepath):
        gz_path = filepath + ".gz" if not filepath.endswith(".gz") else None
        if gz_path and os.path.exists(gz_path):
            data.filename = data.filename + ".gz"
        else:
            root_path = os.path.join(LOGS_BASE_DIR, data.filename)
            if user.is_admin and os.path.exists(root_path):
                logs_dir = LOGS_BASE_DIR
            else:
                raise HTTPException(404, f"Log file not found: {data.filename}")

    # Stop any existing replay for this user
    await replay_reg.stop_session(user.id)

    # Create a new replay session for this user
    replay_session = replay_reg.get_or_create(user.id)

    # Point engine to the correct logs directory
    replay_session.engine.logs_dir = logs_dir

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

    replay_session.fifo.reset()
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
    db: AsyncSession = Depends(get_db),
):
    """Seek to a specific block in the replay."""
    replay_reg = _get_replay_registry(request)
    replay_session = replay_reg.get(user.id)
    if not replay_session:
        raise HTTPException(400, "No active replay")

    if not replay_session.engine._filename or not replay_session.engine._blocks:
        raise HTTPException(400, "No replay loaded")

    # Reset state
    replay_session.state.reset()
    replay_session._init_teams_loaded = False  # Allow teams to re-load from new init

    # Re-apply user config from DB (same as start_replay)
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

    if session:
        circuit = None
        if session.circuit_id:
            circuit = (await db.execute(
                select(Circuit).where(Circuit.id == session.circuit_id)
            )).scalar_one_or_none()
        replay_session.apply_config(session, circuit)

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
    else:
        replay_session.differentials["team_positions"] = {}
        replay_session.differentials["driver_differentials"] = {}

    # Reset FIFO for seek
    replay_session.fifo.reset()
    replay_session.fifo.apply_to_state(replay_session.state)

    await replay_session.engine.seek(data.block)
    await replay_session.start_analytics()
    await replay_session.state._broadcast(replay_session.state.get_snapshot())
    return replay_session.engine.status


@router.get("/download-session")
async def download_session(
    filename: str = Query(...),
    start_block: int = Query(...),
    end_block: int = Query(-1),
    circuit_dir: str | None = Query(None),
    owner_id: int | None = Query(None),
    user: User = Depends(get_current_user),
):
    """Download raw log lines for a specific session (block range) as a text file."""
    from app.apex.parser import ApexMessageParser

    logs_dir = _resolve_logs_dir(user, owner_id, circuit_dir)

    # Check file exists with fallbacks
    filepath = os.path.join(logs_dir, filename)
    if not os.path.exists(filepath):
        gz_path = filepath + ".gz" if not filepath.endswith(".gz") else None
        if gz_path and os.path.exists(gz_path):
            filename = filename + ".gz"
            filepath = gz_path
        else:
            root_path = os.path.join(LOGS_BASE_DIR, filename)
            if user.is_admin and os.path.exists(root_path):
                logs_dir = LOGS_BASE_DIR
                filepath = root_path
            else:
                raise HTTPException(404, f"Log file not found: {filename}")

    engine = ReplayEngine(ApexMessageParser(), lambda e: None, logs_dir=logs_dir)
    blocks = engine._parse_log_file(filepath)

    if not blocks:
        raise HTTPException(404, "Log file is empty")

    total = len(blocks)
    start = max(0, min(start_block, total - 1))
    end = end_block if 0 < end_block <= total else total

    # Build the text output
    lines = []
    for i in range(start, end):
        ts, message = blocks[i]
        lines.append(ts.strftime("%Y-%m-%d %H:%M:%S"))
        lines.append(message)
        lines.append("")  # blank line separator

    content = "\n".join(lines)

    # Build a nice filename for the download
    session_name = filename.replace(".log.gz", "").replace(".log", "")
    download_name = f"{session_name}_block{start}-{end}.log"

    return PlainTextResponse(
        content=content,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


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
