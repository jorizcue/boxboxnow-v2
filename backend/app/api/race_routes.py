"""REST API routes for race state (user-scoped).

CircuitHub architecture: users are auto-subscribed to their circuit's
message stream when they have an active session. No manual connect needed.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from app.models.schemas import User
from app.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/race", tags=["race"])


async def ensure_monitoring(app_state, user_id: int):
    """Ensure the user has an active monitoring session.
    If they have a DB session but no in-memory UserSession, create one
    and subscribe to CircuitHub.

    Returns the UserSession or None.
    """
    registry = app_state.registry
    circuit_hub = app_state.circuit_hub

    # Already monitoring?
    existing = registry.get(user_id)
    if existing:
        return existing

    # Check DB for active session
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.database import async_session
    from app.models.schemas import RaceSession, TeamPosition

    async with async_session() as db:
        result = await db.execute(
            select(RaceSession)
            .options(
                selectinload(RaceSession.circuit),
                selectinload(RaceSession.team_positions).selectinload(TeamPosition.drivers),
            )
            .where(RaceSession.user_id == user_id, RaceSession.is_active == True)
        )
        session = result.scalar_one_or_none()

    if not session or not session.circuit:
        return None

    circuit = session.circuit

    # Create UserSession and subscribe to hub
    user_session = await registry.start_session(
        user_id=user_id,
        circuit_id=circuit.id,
        circuit_hub=circuit_hub,
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
        min_driver_time_min=session.min_driver_time_min,
    )

    # Configure PHP API client for driver auto-loading
    user_session.set_php_api(
        php_api_url=circuit.php_api_url or "",
        php_api_port=circuit.php_api_port or 0,
    )

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
    user_session.set_driver_differentials(driver_differentials, team_positions)

    logger.info(f"Auto-started monitoring for user {user_id} on circuit {circuit.name}")
    return user_session


def _get_user_state(request: Request, user: User):
    """Get the user's RaceStateManager, falling back to replay state."""
    registry = request.app.state.registry
    replay_registry = request.app.state.replay_registry

    # Priority: active replay > live session > blank replay
    replay_session = replay_registry.get(user.id)
    if replay_session and replay_session.engine._active:
        return replay_session.state

    session = registry.get(user.id)
    if session:
        return session.state

    if replay_session:
        return replay_session.state

    replay_session = replay_registry.get_or_create(user.id)
    return replay_session.state


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


@router.get("/status")
async def get_connection_status(request: Request, user: User = Depends(get_current_user)):
    """Check user's monitoring status and circuit hub connection."""
    registry = request.app.state.registry
    circuit_hub = request.app.state.circuit_hub
    session = registry.get(user.id)

    if session:
        conn = circuit_hub.get_connection(session.circuit_id)
        return {
            "monitoring": True,
            "circuit_id": session.circuit_id,
            "circuit_connected": conn.connected if conn else False,
            "circuit_messages": conn.message_count if conn else 0,
            "circuit_name": conn.circuit_name if conn else "Desconocido",
            # Legacy field for frontend compatibility
            "apex_connected": True,
            "circuit": conn.circuit_name if conn else "Desconocido",
        }
    return {
        "monitoring": False,
        "circuit_id": None,
        "circuit_connected": False,
        "circuit_messages": 0,
        "circuit_name": None,
        "apex_connected": False,
        "circuit": None,
    }


@router.get("/hub-status")
async def get_hub_status(request: Request, user: User = Depends(get_current_user)):
    """Get CircuitHub status (all circuit connections)."""
    circuit_hub = request.app.state.circuit_hub
    return {"circuits": circuit_hub.get_status()}


@router.post("/disconnect")
async def disconnect_monitoring(request: Request, user: User = Depends(get_current_user)):
    """Stop monitoring (unsubscribe from circuit hub)."""
    registry = request.app.state.registry
    circuit_hub = request.app.state.circuit_hub
    await registry.stop_session(user.id, circuit_hub)
    return {"status": "disconnected"}


@router.get("/live-teams")
async def get_live_teams(request: Request, user: User = Depends(get_current_user)):
    """Get teams and drivers currently visible in the live timing.
    Returns data suitable for importing into team_positions + team_drivers.
    """
    state = _get_user_state(request, user)

    if not state.karts:
        return {"teams": [], "hasDrivers": False}

    sorted_karts = sorted(state.karts.values(), key=lambda k: k.position or 999)

    teams = []
    has_any_drivers = False

    for i, kart in enumerate(sorted_karts):
        team_data = {
            "position": i + 1,
            "kart": kart.kart_number,
            "team_name": kart.team_name,
            "drivers": [],
        }

        if kart.driver_name and kart.driver_name.strip():
            has_any_drivers = True
            team_data["drivers"].append({
                "driver_name": kart.driver_name.strip(),
                "differential_ms": 0,
            })

        teams.append(team_data)

    return {
        "teams": teams,
        "hasDrivers": has_any_drivers,
        "kartCount": len(teams),
    }
