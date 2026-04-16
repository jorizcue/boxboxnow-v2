"""REST API routes for user-scoped race configuration."""

import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.schemas import User, Circuit, UserCircuitAccess, RaceSession, TeamPosition, TeamDriver, UserPreferences, DriverConfigPreset
from app.models.pydantic_models import (
    CircuitOut,
    RaceSessionOut, RaceSessionCreate, RaceSessionUpdate,
    TeamPositionOut, TeamPositionCreate, TeamDriverOut,
    UserPreferencesOut, UserPreferencesUpdate,
    PresetCreate, PresetOut, PresetUpdate,
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
    request: Request,
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

    # Stop any existing monitoring and auto-start on new circuit
    from app.api.race_routes import ensure_monitoring
    registry = request.app.state.registry
    circuit_hub = request.app.state.circuit_hub
    if registry.get(user.id):
        await registry.stop_session(user.id, circuit_hub)
    await ensure_monitoring(request.app.state, user.id)

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

    # If there's an active UserSession (live monitoring), reconfigure or restart it
    registry = request.app.state.registry
    user_session = registry.get(user.id)

    if user_session and data.circuit_id and data.circuit_id != user_session.circuit_id:
        # Circuit changed — restart monitoring on new circuit
        circuit_hub = request.app.state.circuit_hub
        await registry.stop_session(user.id, circuit_hub)
        from app.api.race_routes import ensure_monitoring
        user_session = await ensure_monitoring(request.app.state, user.id)
        logger.info(f"Restarted monitoring for user {user.id} on new circuit")
    elif user_session:
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
            min_driver_time_min=session.min_driver_time_min,
            pit_closed_start_min=session.pit_closed_start_min,
            pit_closed_end_min=session.pit_closed_end_min,
            finish_lat1=c.finish_lat1 if c else None,
            finish_lon1=c.finish_lon1 if c else None,
            finish_lat2=c.finish_lat2 if c else None,
            finish_lon2=c.finish_lon2 if c else None,
        )
        await user_session.broadcast_snapshot()
        logger.info(f"Live reconfigured session for user {user.id} "
                    f"(boxLines={session.box_lines}, boxKarts={session.box_karts})")
    else:
        # No live session yet — auto-start monitoring
        from app.api.race_routes import ensure_monitoring
        await ensure_monitoring(request.app.state, user.id)

    # Also update user's replay session if active
    replay_reg = getattr(request.app.state, "replay_registry", None)
    if replay_reg:
        replay_session = replay_reg.get(user.id)
        if replay_session:
            replay_session.update_config_fields(session, c)
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

    # Update user's replay session differentials too
    replay_reg = getattr(request.app.state, "replay_registry", None)
    if replay_reg:
        replay_session = replay_reg.get(user.id)
        if replay_session:
            replay_session.differentials["team_positions"] = team_positions
            replay_session.differentials["driver_differentials"] = driver_differentials

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


# --- User Preferences (driver view config) ---

@router.get("/preferences", response_model=UserPreferencesOut)
async def get_preferences(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get driver view preferences for the current user."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        return UserPreferencesOut()
    return UserPreferencesOut(
        visible_cards=json.loads(prefs.visible_cards) if prefs.visible_cards else {},
        card_order=json.loads(prefs.card_order) if prefs.card_order else [],
    )


@router.patch("/preferences", response_model=UserPreferencesOut)
async def update_preferences(
    data: UserPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update driver view preferences for the current user."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()

    if not prefs:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)

    update_data = data.model_dump(exclude_unset=True)
    if "visible_cards" in update_data:
        prefs.visible_cards = json.dumps(update_data["visible_cards"])
    if "card_order" in update_data:
        prefs.card_order = json.dumps(update_data["card_order"])

    await db.commit()
    await db.refresh(prefs)

    return UserPreferencesOut(
        visible_cards=json.loads(prefs.visible_cards) if prefs.visible_cards else {},
        card_order=json.loads(prefs.card_order) if prefs.card_order else [],
    )


# --- Driver Config Presets ---

MAX_PRESETS_PER_USER = 10


def _preset_to_out(p: DriverConfigPreset) -> PresetOut:
    return PresetOut(
        id=p.id,
        name=p.name,
        visible_cards=json.loads(p.visible_cards) if p.visible_cards else {},
        card_order=json.loads(p.card_order) if p.card_order else [],
        is_default=bool(getattr(p, "is_default", False)),
        contrast=getattr(p, "contrast", None),
        orientation=getattr(p, "orientation", None),
        audio_enabled=getattr(p, "audio_enabled", None),
    )


async def _clear_default_presets(db: AsyncSession, user_id: int, except_id: int | None = None):
    """Unset is_default on all of a user's presets except optionally one."""
    from sqlalchemy import update as sql_update
    stmt = sql_update(DriverConfigPreset).where(
        DriverConfigPreset.user_id == user_id,
        DriverConfigPreset.is_default == True,
    ).values(is_default=False)
    if except_id is not None:
        stmt = stmt.where(DriverConfigPreset.id != except_id)
    await db.execute(stmt)


async def _notify_default_preset_changed(user_id: int, preset_id: int | None):
    """Push a WS event so every connected client (especially iOS DriverView)
    can reload and auto-apply the new default preset live."""
    try:
        from app.ws.server import broadcast_to_user
        await broadcast_to_user(user_id, {
            "type": "preset_default_changed",
            "preset_id": preset_id,
        })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            f"preset_default_changed broadcast failed (user={user_id}): {e}"
        )


@router.get("/presets", response_model=list[PresetOut])
async def list_presets(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DriverConfigPreset)
        .where(DriverConfigPreset.user_id == user.id)
        .order_by(DriverConfigPreset.created_at)
    )
    return [_preset_to_out(p) for p in result.scalars().all()]


@router.post("/presets", response_model=PresetOut, status_code=201)
async def create_preset(
    data: PresetCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = data.name.strip()
    if not name or len(name) > 50:
        raise HTTPException(400, "El nombre debe tener entre 1 y 50 caracteres")

    # Check limit
    count_result = await db.execute(
        select(DriverConfigPreset.id).where(DriverConfigPreset.user_id == user.id)
    )
    if len(count_result.all()) >= MAX_PRESETS_PER_USER:
        raise HTTPException(400, f"Máximo {MAX_PRESETS_PER_USER} plantillas permitidas")

    # Check duplicate name
    dup = await db.execute(
        select(DriverConfigPreset).where(
            DriverConfigPreset.user_id == user.id,
            DriverConfigPreset.name == name,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(409, "Ya existe una plantilla con ese nombre")

    want_default = bool(data.is_default)
    if want_default:
        await _clear_default_presets(db, user.id)

    preset = DriverConfigPreset(
        user_id=user.id,
        name=name,
        visible_cards=json.dumps(data.visible_cards),
        card_order=json.dumps(data.card_order),
        is_default=want_default,
        contrast=data.contrast,
        orientation=data.orientation,
        audio_enabled=data.audio_enabled,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)

    if want_default:
        await _notify_default_preset_changed(user.id, preset.id)

    return _preset_to_out(preset)


@router.patch("/presets/{preset_id}", response_model=PresetOut)
async def update_preset(
    preset_id: int,
    data: PresetUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DriverConfigPreset).where(
            DriverConfigPreset.id == preset_id,
            DriverConfigPreset.user_id == user.id,
        )
    )
    preset = result.scalar_one_or_none()
    if not preset:
        raise HTTPException(404, "Plantilla no encontrada")

    update = data.model_dump(exclude_unset=True)
    if "name" in update:
        name = update["name"].strip()
        if not name or len(name) > 50:
            raise HTTPException(400, "El nombre debe tener entre 1 y 50 caracteres")
        dup = await db.execute(
            select(DriverConfigPreset).where(
                DriverConfigPreset.user_id == user.id,
                DriverConfigPreset.name == name,
                DriverConfigPreset.id != preset_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(409, "Ya existe una plantilla con ese nombre")
        preset.name = name
    if "visible_cards" in update:
        preset.visible_cards = json.dumps(update["visible_cards"])
    if "card_order" in update:
        preset.card_order = json.dumps(update["card_order"])
    if "contrast" in update:
        preset.contrast = update["contrast"]
    if "orientation" in update:
        preset.orientation = update["orientation"]
    if "audio_enabled" in update:
        preset.audio_enabled = update["audio_enabled"]

    default_toggled = False
    new_default_id: int | None = None
    if "is_default" in update:
        want = bool(update["is_default"])
        if want:
            # Only one default per user — clear others then set this one.
            await _clear_default_presets(db, user.id, except_id=preset.id)
            preset.is_default = True
            default_toggled = True
            new_default_id = preset.id
        else:
            if preset.is_default:
                default_toggled = True
                new_default_id = None
            preset.is_default = False

    await db.commit()
    await db.refresh(preset)

    if default_toggled:
        await _notify_default_preset_changed(user.id, new_default_id)

    return _preset_to_out(preset)


@router.delete("/presets/{preset_id}", status_code=204)
async def delete_preset(
    preset_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DriverConfigPreset).where(
            DriverConfigPreset.id == preset_id,
            DriverConfigPreset.user_id == user.id,
        )
    )
    preset = result.scalar_one_or_none()
    if not preset:
        raise HTTPException(404, "Plantilla no encontrada")
    was_default = bool(getattr(preset, "is_default", False))
    await db.delete(preset)
    await db.commit()
    if was_default:
        await _notify_default_preset_changed(user.id, None)
