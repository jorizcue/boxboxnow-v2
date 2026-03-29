"""REST API routes for user-scoped race configuration."""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.schemas import User, Circuit, UserCircuitAccess, RaceSession, TeamPosition, TeamDriver
from app.models.pydantic_models import (
    CircuitOut,
    RaceSessionOut, RaceSessionCreate, RaceSessionUpdate,
    TeamPositionOut, TeamPositionCreate, TeamDriverOut,
)
from app.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["config"])


# --- Circuits (user sees only their accessible ones) ---

@router.get("/circuits", response_model=list[CircuitOut])
async def list_my_circuits(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List circuits the current user has valid access to."""
    now = datetime.now(timezone.utc)

    if user.is_admin:
        result = await db.execute(select(Circuit).order_by(Circuit.name))
        return result.scalars().all()

    result = await db.execute(
        select(Circuit)
        .join(UserCircuitAccess)
        .where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
        .order_by(Circuit.name)
    )
    return result.scalars().all()


@router.get("/live-timing-url")
async def get_live_timing_url(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get the live timing URL for the user's active session circuit."""
    result = await db.execute(
        select(RaceSession)
        .options(selectinload(RaceSession.circuit))
        .where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    session = result.scalar_one_or_none()
    if not session or not session.circuit:
        return {"url": None}
    return {"url": session.circuit.live_timing_url or None}


# --- Race Sessions ---

@router.get("/session", response_model=RaceSessionOut | None)
async def get_active_session(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get the user's active race session."""
    result = await db.execute(
        select(RaceSession)
        .options(
            selectinload(RaceSession.team_positions).selectinload(TeamPosition.drivers),
            selectinload(RaceSession.circuit),
        )
        .where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    return _session_to_out(session)


@router.post("/session", response_model=RaceSessionOut)
async def create_session(
    data: RaceSessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new race session (deactivates any existing active session)."""
    # Verify circuit access
    await _verify_circuit_access(user, data.circuit_id, db)

    # Deactivate existing active sessions
    result = await db.execute(
        select(RaceSession).where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    for old in result.scalars().all():
        old.is_active = False

    # Create new session with circuit defaults
    circuit = await db.execute(select(Circuit).where(Circuit.id == data.circuit_id))
    c = circuit.scalar_one_or_none()

    session_data = data.model_dump()
    if c and c.pit_time_s and data.pit_time_s == 120:
        session_data["pit_time_s"] = c.pit_time_s

    session = RaceSession(user_id=user.id, **session_data)
    db.add(session)
    await db.commit()

    return await _reload_session(user.id, db)


@router.patch("/session", response_model=RaceSessionOut)
async def update_session(
    data: RaceSessionUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the user's active race session."""
    result = await db.execute(
        select(RaceSession).where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "No active session")

    if data.circuit_id and data.circuit_id != session.circuit_id:
        await _verify_circuit_access(user, data.circuit_id, db)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(session, key, value)

    await db.commit()

    # Reload circuit info for config values
    circuit = await db.execute(select(Circuit).where(Circuit.id == session.circuit_id))
    c = circuit.scalar_one_or_none()

    # If there's an active UserSession (live Apex), reconfigure it
    registry = request.app.state.registry
    user_session = registry.get(user.id)
    if user_session:
        user_session.configure(
            circuit_length_m=c.length_m if c else 1100,
            pit_time_s=session.pit_time_s,
            laps_discard=c.laps_discard if c else 3,
            lap_differential=c.lap_differential if c else 2000,
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
        await user_session.broadcast_snapshot()
        logger.info(f"Live reconfigured session for user {user.id} "
                    f"(boxLines={session.box_lines}, boxKarts={session.box_karts})")

    # Also update replay_state so analytics broadcasts don't overwrite frontend config
    replay_state = getattr(request.app.state, "replay_state", None)
    if replay_state:
        replay_state.our_kart_number = session.our_kart_number
        replay_state.min_pits = session.min_pits
        replay_state.max_stint_min = session.max_stint_min
        replay_state.min_stint_min = session.min_stint_min
        replay_state.box_lines = session.box_lines
        replay_state.box_karts = session.box_karts
        replay_state.duration_min = session.duration_min
        replay_state.pit_time_s = session.pit_time_s
        replay_state.circuit_length_m = c.length_m if c else replay_state.circuit_length_m
        replay_state.min_driver_time_min = session.min_driver_time_min
        # Update replay FIFO config only if box params changed (update_config resets queue)
        replay_fifo = getattr(request.app.state, "replay_fifo", None)
        if replay_fifo and (
            replay_fifo.queue_size != session.box_karts
            or replay_fifo.box_lines != session.box_lines
        ):
            replay_fifo.update_config(session.box_karts, session.box_lines)
        logger.info(f"Replay state updated for user {user.id} config change")

    return await _reload_session(user.id, db)


@router.delete("/session")
async def delete_session(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Delete the user's active session."""
    result = await db.execute(
        select(RaceSession).where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "No active session")

    await db.delete(session)
    await db.commit()
    return {"deleted": True}


# --- Team Positions ---

@router.get("/teams", response_model=list[TeamPositionOut])
async def list_teams(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List teams with their drivers in the user's active session."""
    session = await _get_active_session(user, db)
    result = await db.execute(
        select(TeamPosition)
        .options(selectinload(TeamPosition.drivers))
        .where(TeamPosition.race_session_id == session.id)
        .order_by(TeamPosition.position)
    )
    return result.scalars().all()


@router.put("/teams", response_model=list[TeamPositionOut])
async def replace_teams(
    teams: list[TeamPositionCreate],
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace all team positions and their drivers in the user's active session."""
    session = await _get_active_session(user, db)

    await db.execute(
        delete(TeamPosition).where(TeamPosition.race_session_id == session.id)
    )

    new_teams = []
    for t in teams:
        team = TeamPosition(
            race_session_id=session.id,
            position=t.position,
            kart=t.kart,
            team_name=t.team_name,
        )
        # Create drivers for this team
        for d in t.drivers:
            driver = TeamDriver(
                driver_name=d.driver_name,
                differential_ms=d.differential_ms,
            )
            team.drivers.append(driver)

        db.add(team)
        new_teams.append(team)

    await db.commit()

    # Build in-memory differentials from the saved teams
    team_positions = {}
    driver_differentials = {}
    for t in teams:
        team_positions[t.kart] = t.position
        if t.drivers:
            driver_differentials[t.kart] = {
                d.driver_name.strip().lower(): d.differential_ms
                for d in t.drivers
            }

    # Update live session differentials
    registry = request.app.state.registry
    user_session = registry.get(user.id)
    if user_session:
        user_session.set_driver_differentials(driver_differentials, team_positions)

    # Update replay differentials too
    replay_diffs = getattr(request.app.state, "replay_differentials", None)
    if replay_diffs is not None:
        replay_diffs["team_positions"] = team_positions
        replay_diffs["driver_differentials"] = driver_differentials

    logger.info(f"Updated in-memory differentials for user {user.id}: "
                f"{sum(len(d) for d in driver_differentials.values())} drivers")

    # Re-query with eager loading to avoid lazy load errors on serialization
    result = await db.execute(
        select(TeamPosition)
        .options(selectinload(TeamPosition.drivers))
        .where(TeamPosition.race_session_id == session.id)
        .order_by(TeamPosition.position)
    )
    return result.scalars().all()


# --- Helpers ---

def _session_to_out(session: RaceSession) -> RaceSessionOut:
    """Convert a fully-loaded RaceSession to its Pydantic output model."""
    return RaceSessionOut(
        **{c.name: getattr(session, c.name) for c in RaceSession.__table__.columns},
        circuit_name=session.circuit.name if session.circuit else None,
        team_positions=[TeamPositionOut.model_validate(t) for t in session.team_positions],
    )


async def _reload_session(user_id: int, db: AsyncSession) -> RaceSessionOut:
    """Re-query the active session with all eager loads for safe serialization."""
    result = await db.execute(
        select(RaceSession)
        .options(
            selectinload(RaceSession.team_positions).selectinload(TeamPosition.drivers),
            selectinload(RaceSession.circuit),
        )
        .where(RaceSession.user_id == user_id, RaceSession.is_active == True)
    )
    session = result.scalar_one()
    return _session_to_out(session)


async def _get_active_session(user: User, db: AsyncSession) -> RaceSession:
    result = await db.execute(
        select(RaceSession).where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "No active session. Create one first.")
    return session


async def _verify_circuit_access(user: User, circuit_id: int, db: AsyncSession):
    if user.is_admin:
        return

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserCircuitAccess).where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.circuit_id == circuit_id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(403, "No access to this circuit")
