"""REST API routes for log replay control."""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

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
async def start_replay(data: ReplayStartRequest, request: Request):
    """Start replaying a log file."""
    replay = request.app.state.replay_engine
    try:
        await replay.start(data.filename, data.speed)
        return {"status": "started", "filename": data.filename, "speed": data.speed}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.post("/stop")
async def stop_replay(request: Request):
    """Stop the current replay."""
    replay = request.app.state.replay_engine
    await replay.stop()
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
