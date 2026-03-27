"""REST API routes for race state and data."""

from fastapi import APIRouter, Request
from app.models.pydantic_models import KartStateOut, FifoStateOut

router = APIRouter(prefix="/api/race", tags=["race"])


@router.get("/snapshot")
async def get_snapshot(request: Request):
    """Get current race state snapshot."""
    state = request.app.state.race_state
    return state.get_snapshot()


@router.get("/karts")
async def get_karts(request: Request):
    """Get current kart states."""
    state = request.app.state.race_state
    sorted_karts = sorted(state.karts.values(), key=lambda k: k.position or 999)
    return [k.to_dict() for k in sorted_karts]


@router.get("/classification")
async def get_classification(request: Request):
    """Get current distance-based classification."""
    state = request.app.state.race_state
    return state.classification


@router.get("/fifo")
async def get_fifo(request: Request):
    """Get current FIFO queue state."""
    state = request.app.state.race_state
    return {
        "queue": state.fifo_queue,
        "score": state.fifo_score,
        "history": state.fifo_history[-10:],
    }
