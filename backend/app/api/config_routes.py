"""REST API routes for user-scoped race configuration."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
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


# --- Race Sessions ---

@router.get("/session", response_model=RaceSessionOut | None)
async def get_active_session(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get the user's active race session."""
    result = await db.execute(
        select(RaceSession)
        .options(selectinload(RaceSession.team_positions), selectinload(RaceSession.circuit))
        .where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    return RaceSessionOut(
        **{c.name: getattr(session, c.name) for c in RaceSession.__table__.columns},
        circuit_name=session.circuit.name if session.circuit else None,
        team_positions=[TeamPositionOut.model_validate(t) for t in session.team_positions],
    )


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
    await db.refresh(session)

    return RaceSessionOut(
        **{col.name: getattr(session, col.name) for col in RaceSession.__table__.columns},
        circuit_name=c.name if c else None,
        team_positions=[],
    )


@router.patch("/session", response_model=RaceSessionOut)
async def update_session(
    data: RaceSessionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the user's active race session."""
    result = await db.execute(
        select(RaceSession)
        .options(selectinload(RaceSession.team_positions), selectinload(RaceSession.circuit))
        .where(RaceSession.user_id == user.id, RaceSession.is_active == True)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "No active session")

    # If changing circuit, verify access
    if data.circuit_id and data.circuit_id != session.circuit_id:
        await _verify_circuit_access(user, data.circuit_id, db)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(session, key, value)

    await db.commit()
    await db.refresh(session)

    return RaceSessionOut(
        **{col.name: getattr(session, col.name) for col in RaceSession.__table__.columns},
        circuit_name=session.circuit.name if session.circuit else None,
        team_positions=[TeamPositionOut.model_validate(t) for t in session.team_positions],
    )


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
    for t in new_teams:
        await db.refresh(t)
    return new_teams


# --- Helpers ---

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
