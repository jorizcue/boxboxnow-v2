"""REST API routes for race state (user-scoped)."""

from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import User
from app.api.auth_routes import get_current_user
from fastapi import Request

router = APIRouter(prefix="/api/race", tags=["race"])


def _get_user_state(request: Request, user: User):
    """Get the user's RaceStateManager, falling back to replay state."""
    registry = request.app.state.registry
    session = registry.get(user.id)
    if session:
        return session.state
    return request.app.state.replay_state


@router.get("/snapshot")
async def get_snapshot(request: Request, user: User = Depends(get_current_user)):
    state = _get_user_state(request, user)
    return state.get_snapshot()


@router.get("/karts")
async def get_karts(request: Request, user: User = Depends(get_current_user)):
    state = _get_user_state(request, user)
    sorted_karts = sorted(state.karts.values(), key=lambda k: k.position or 999)
    return [k.to_dict() for k in sorted_karts]


@router.get("/classification")
async def get_classification(request: Request, user: User = Depends(get_current_user)):
    state = _get_user_state(request, user)
    return state.classification


@router.get("/fifo")
async def get_fifo(request: Request, user: User = Depends(get_current_user)):
    state = _get_user_state(request, user)
    return {
        "queue": state.fifo_queue,
        "score": state.fifo_score,
        "history": state.fifo_history[-10:],
    }


@router.post("/connect")
async def connect_to_apex(request: Request, user: User = Depends(get_current_user)):
    """Start the Apex WebSocket connection for the user's active session.
    Loads team positions and driver differentials for clustering."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.database import async_session
    from app.models.schemas import RaceSession, Circuit, TeamPosition, TeamDriver

    async with async_session() as db:
        result = await db.execute(
            select(RaceSession)
            .options(
                selectinload(RaceSession.circuit),
                selectinload(RaceSession.team_positions).selectinload(TeamPosition.drivers),
            )
            .where(RaceSession.user_id == user.id, RaceSession.is_active == True)
        )
        session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(404, "No active race session. Configure one first.")

    circuit = session.circuit
    if not circuit:
        raise HTTPException(400, "Circuit not found")

    registry = request.app.state.registry
    user_session = await registry.start_session(
        user_id=user.id,
        ws_port=circuit.ws_port,
        circuit_length_m=circuit.length_m or 1100,
        pit_time_s=session.pit_time_s,
        laps_discard=circuit.laps_discard,
        lap_differential=circuit.lap_differential,
        rain=session.rain,
        our_kart=session.our_kart_number,
        min_pits=session.min_pits,
        max_stint_min=session.max_stint_min,
        min_stint_min=session.min_stint_min,
        box_lines=session.box_lines,
        box_karts=session.box_karts,
        duration_min=session.duration_min,
        refresh_s=session.refresh_interval_s,
    )

    # Load team positions and driver differentials for clustering
    team_positions = {}  # kart_number -> theoretical_position
    driver_differentials = {}  # kart_number -> {driver_name_lower: differential_ms}

    for tp in session.team_positions:
        team_positions[tp.kart] = tp.position

        if tp.drivers:
            driver_differentials[tp.kart] = {
                d.driver_name.strip().lower(): d.differential_ms
                for d in tp.drivers
            }

    user_session.set_driver_differentials(driver_differentials, team_positions)

    return {
        "status": "connected",
        "circuit": circuit.name,
        "wsPort": circuit.ws_port,
        "teamsLoaded": len(team_positions),
        "driversWithDifferential": sum(
            len(d) for d in driver_differentials.values()
        ),
    }


@router.post("/disconnect")
async def disconnect_from_apex(request: Request, user: User = Depends(get_current_user)):
    """Stop the Apex WebSocket connection."""
    registry = request.app.state.registry
    await registry.stop_session(user.id)
    return {"status": "disconnected"}
