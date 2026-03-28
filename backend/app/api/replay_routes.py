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
    replay_state = request.app.state.replay_state
    replay_fifo = request.app.state.replay_fifo

    # Reset state and FIFO before starting new replay
    replay_state.reset()
    replay_fifo.update_config(replay_fifo.queue_size, replay_fifo.box_lines)
    replay_fifo._history.clear()

    try:
        await replay.start(data.filename, data.speed)
        # Broadcast empty snapshot so clients see the reset (timer at 00:00:00)
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
