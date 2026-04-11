"""REST API routes for kart analytics."""

import logging
import os
import re
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, func as sqlfunc

from app.models.database import get_db
from app.models.schemas import User, RaceLog, KartLap, Circuit, UserCircuitAccess
from app.models.pydantic_models import KartStatsOut, RaceLogOut, CircuitOut
from app.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


async def _check_circuit_access(user: User, circuit_id: int, db: AsyncSession):
    """Raise 403 if non-admin user has no access to circuit."""
    if user.is_admin:
        return
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserCircuitAccess.id).where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.circuit_id == circuit_id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(403, "No access to this circuit")


@router.get("/circuits", response_model=list[CircuitOut])
async def list_analytics_circuits(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List circuits available to the user for analytics."""
    if user.is_admin:
        result = await db.execute(select(Circuit).order_by(Circuit.name))
        return result.scalars().all()

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Circuit)
        .join(UserCircuitAccess, Circuit.id == UserCircuitAccess.circuit_id)
        .where(
            UserCircuitAccess.user_id == user.id,
            UserCircuitAccess.valid_from <= now,
            UserCircuitAccess.valid_until >= now,
        )
        .order_by(Circuit.name)
    )
    return result.scalars().all()


def _parse_date_range(date_from: str | None, date_to: str | None):
    """Parse date range params, defaulting to last 7 days."""
    now = datetime.now(timezone.utc)
    dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc) if date_from else now - timedelta(days=7)
    dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc, hour=23, minute=59, second=59) if date_to else now
    return dt_from, dt_to


async def _get_race_log_ids(db: AsyncSession, circuit_id: int, dt_from, dt_to) -> list[int]:
    result = await db.execute(
        select(RaceLog.id).where(
            RaceLog.circuit_id == circuit_id,
            RaceLog.race_date >= dt_from,
            RaceLog.race_date <= dt_to,
        )
    )
    return [r[0] for r in result.all()]


@router.get("/kart-stats", response_model=list[KartStatsOut])
async def get_kart_stats(
    circuit_id: int,
    date_from: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    filter_outliers: bool = Query(True, description="Filter laps >10% from mean"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated kart performance stats for a circuit within a date range."""
    await _check_circuit_access(user, circuit_id, db)
    dt_from, dt_to = _parse_date_range(date_from, date_to)
    race_log_ids = await _get_race_log_ids(db, circuit_id, dt_from, dt_to)

    if not race_log_ids:
        return []

    # Fetch all laps for those races
    result = await db.execute(
        select(KartLap).where(KartLap.race_log_id.in_(race_log_ids))
    )
    all_laps = result.scalars().all()

    # Aggregate by kart_number
    kart_data: dict[int, dict] = defaultdict(lambda: {
        "laps": [],
        "valid_laps": [],
        "teams": set(),
        "race_ids": set(),
    })

    for lap in all_laps:
        d = kart_data[lap.kart_number]
        d["laps"].append(lap.lap_time_ms)
        if lap.is_valid:
            d["valid_laps"].append(lap.lap_time_ms)
        if lap.team_name:
            d["teams"].add(lap.team_name)
        d["race_ids"].add(lap.race_log_id)

    # Build stats
    stats = []
    for kart_number, d in sorted(kart_data.items()):
        valid = d["valid_laps"]
        all_l = d["laps"]
        if not valid:
            continue

        if filter_outliers:
            # Filter outliers: remove laps >10% away from the mean
            raw_mean = sum(valid) / len(valid)
            threshold = raw_mean * 0.10
            filtered = [t for t in valid if abs(t - raw_mean) <= threshold]
            if not filtered:
                filtered = valid  # fallback
        else:
            filtered = valid

        sorted_valid = sorted(filtered)
        best5 = sorted_valid[:5]

        stats.append(KartStatsOut(
            kart_number=kart_number,
            races=len(d["race_ids"]),
            total_laps=len(all_l),
            valid_laps=len(filtered),
            avg_lap_ms=sum(filtered) / len(filtered),
            best5_avg_ms=sum(best5) / len(best5),
            best_lap_ms=sorted_valid[0],
            teams=sorted(d["teams"]),
        ))

    # Sort by best5_avg_ms (fastest first)
    stats.sort(key=lambda s: s.best5_avg_ms)
    return stats


@router.get("/kart-best-laps")
async def get_kart_best_laps(
    circuit_id: int,
    kart_number: int,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    filter_outliers: bool = Query(True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the 5 best laps for a specific kart with race date, team, driver."""
    await _check_circuit_access(user, circuit_id, db)
    dt_from, dt_to = _parse_date_range(date_from, date_to)
    race_log_ids = await _get_race_log_ids(db, circuit_id, dt_from, dt_to)

    if not race_log_ids:
        return []

    # Fetch laps with race_log date
    result = await db.execute(
        select(KartLap, RaceLog.race_date).join(
            RaceLog, KartLap.race_log_id == RaceLog.id
        ).where(
            KartLap.race_log_id.in_(race_log_ids),
            KartLap.kart_number == kart_number,
            KartLap.is_valid == True,
        )
    )
    rows = result.all()

    if not rows:
        return []

    laps = [(lap, race_date) for lap, race_date in rows]

    if filter_outliers:
        times = [lap.lap_time_ms for lap, _ in laps]
        raw_mean = sum(times) / len(times)
        threshold = raw_mean * 0.10
        laps = [(lap, rd) for lap, rd in laps if abs(lap.lap_time_ms - raw_mean) <= threshold]
        if not laps:
            laps = [(lap, race_date) for lap, race_date in rows]  # fallback

    # Sort by lap time, take best 5
    laps.sort(key=lambda x: x[0].lap_time_ms)
    best5 = laps[:5]

    return [
        {
            "lap_time_ms": lap.lap_time_ms,
            "lap_number": lap.lap_number,
            "team_name": lap.team_name or "",
            "driver_name": lap.driver_name or "",
            "race_date": rd.isoformat() if rd else "",
            "recorded_at": lap.recorded_at.isoformat() if lap.recorded_at else "",
        }
        for lap, rd in best5
    ]


@router.get("/kart-drivers")
async def get_kart_drivers(
    circuit_id: int,
    kart_number: int,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    filter_outliers: bool = Query(True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get per-driver breakdown for a specific kart: avg lap, best lap, laps count."""
    await _check_circuit_access(user, circuit_id, db)
    dt_from, dt_to = _parse_date_range(date_from, date_to)
    race_log_ids = await _get_race_log_ids(db, circuit_id, dt_from, dt_to)

    if not race_log_ids:
        return []

    result = await db.execute(
        select(KartLap).where(
            KartLap.race_log_id.in_(race_log_ids),
            KartLap.kart_number == kart_number,
            KartLap.is_valid == True,
        )
    )
    all_laps = result.scalars().all()

    if not all_laps:
        return []

    # Group by (team_name, driver_name) combination
    driver_data: dict[tuple[str, str], list[int]] = defaultdict(list)
    for lap in all_laps:
        team = (lap.team_name or "").strip()
        driver = (lap.driver_name or "").strip()
        key = (team, driver)
        driver_data[key].append(lap.lap_time_ms)

    drivers = []
    for (team_name, driver_name), times in sorted(driver_data.items()):
        if filter_outliers and len(times) > 3:
            raw_mean = sum(times) / len(times)
            threshold = raw_mean * 0.10
            filtered = [t for t in times if abs(t - raw_mean) <= threshold]
            if not filtered:
                filtered = times
        else:
            filtered = times

        # Build display label: "Team / Driver", or just one if the other is empty
        label = " / ".join(part for part in [team_name, driver_name] if part) or "Desconocido"

        drivers.append({
            "team_name": team_name,
            "driver_name": driver_name,
            "display_name": label,
            "total_laps": len(times),
            "avg_lap_ms": round(sum(filtered) / len(filtered)),
            "best_lap_ms": min(filtered),
        })

    # Sort by avg_lap_ms (fastest first)
    drivers.sort(key=lambda d: d["avg_lap_ms"])
    return drivers


@router.get("/race-logs", response_model=list[RaceLogOut])
async def list_race_logs(
    circuit_id: int,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List historical race logs for a circuit."""
    await _check_circuit_access(user, circuit_id, db)
    now = datetime.now(timezone.utc)
    if date_from:
        dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
    else:
        dt_from = now - timedelta(days=30)
    if date_to:
        dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc, hour=23, minute=59, second=59)
    else:
        dt_to = now

    result = await db.execute(
        select(RaceLog).where(
            RaceLog.circuit_id == circuit_id,
            RaceLog.race_date >= dt_from,
            RaceLog.race_date <= dt_to,
        ).order_by(RaceLog.race_date.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
#  Reprocess day from recording
# ---------------------------------------------------------------------------

RECORDINGS_BASE = "data/recordings"


def _safe_dir_name(name: str) -> str:
    """Convert circuit name to safe directory name (must match DailyRecorder)."""
    return re.sub(r'[^\w\-]', '_', name.strip())[:50]


class ReprocessRequest(BaseModel):
    circuit_id: int
    date: str  # YYYY-MM-DD


@router.post("/reprocess-day")
async def reprocess_day(
    body: ReprocessRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reprocess a day's recording to rebuild race_logs and kart_laps.

    Admin only. Reads the circuit's daily recording file, parses all sessions,
    and recreates the lap data in the database.
    """
    if not user.is_admin:
        raise HTTPException(403, "Admin only")

    # Validate date
    try:
        target_date = datetime.strptime(body.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")

    # Find circuit
    circuit = (await db.execute(
        select(Circuit).where(Circuit.id == body.circuit_id)
    )).scalar_one_or_none()
    if not circuit:
        raise HTTPException(404, "Circuit not found")

    # Find recording file
    circuit_dir = _safe_dir_name(circuit.name)
    log_path = os.path.join(RECORDINGS_BASE, circuit_dir, f"{body.date}.log")
    gz_path = log_path + ".gz"
    if os.path.exists(log_path):
        filepath = log_path
    elif os.path.exists(gz_path):
        filepath = gz_path
    else:
        raise HTTPException(404, f"No recording found for {circuit.name} on {body.date}")

    # Parse the recording file
    from app.apex.replay import parse_log_file
    from app.apex.parser import ApexMessageParser, EventType
    from app.engine.state import RaceStateManager

    logger.info(f"Reprocessing {circuit.name} for {body.date} from {filepath}")
    blocks = parse_log_file(filepath)
    if not blocks:
        raise HTTPException(404, "Recording file is empty")

    # Process all blocks through parser + state to extract laps
    parser = ApexMessageParser()
    state = RaceStateManager()

    # Configure state with circuit defaults
    state.circuit_length_m = circuit.length_m or 1100
    state.laps_discard = circuit.laps_discard or 2
    state.lap_differential = circuit.lap_differential or 3000

    sessions: list[dict] = []  # [{session_name, timestamp, karts: {kart_number: KartState}}]
    current_session_key = ""

    def _build_key() -> str:
        parts = [p for p in (state.category, state.track_name, state.session_title) if p]
        return " | ".join(parts)

    def _session_name() -> str:
        parts = [p for p in (state.category, state.track_name, state.session_title) if p]
        return " - ".join(parts) if parts else f"Auto {circuit.name}"

    def _snapshot_session(timestamp: datetime):
        """Save current state as a completed session."""
        kart_laps = {}
        for row_id, kart in state.karts.items():
            if kart.all_laps:
                kart_laps[kart.kart_number] = {
                    "team_name": kart.team_name,
                    "all_laps": list(kart.all_laps),
                    "valid_laps": list(kart.valid_laps),
                }
        if kart_laps:
            sessions.append({
                "session_name": _session_name(),
                "timestamp": timestamp,
                "kart_laps": kart_laps,
            })

    last_timestamp = blocks[0][0] if blocks else None

    for timestamp, message in blocks:
        last_timestamp = timestamp
        events = parser.parse(message)
        if not events:
            continue

        has_init = any(e.type == EventType.INIT and e.value == "init" for e in events)
        if has_init:
            # Save current session before reset
            _snapshot_session(timestamp)
            state.reset()
            # Re-apply circuit config (reset clears everything)
            state.circuit_length_m = circuit.length_m or 1100
            state.laps_discard = circuit.laps_discard or 2
            state.lap_differential = circuit.lap_differential or 3000
            current_session_key = ""

        # Process events (without broadcasting)
        for event in events:
            try:
                state._apply_event(event)
            except Exception:
                pass  # Skip malformed events (empty countdown, etc.)

        # Detect session change (category/title changed)
        new_key = _build_key()
        if new_key and current_session_key and new_key != current_session_key:
            _snapshot_session(timestamp)
            # Partial reset: clear karts but keep metadata
            old_category = state.category
            old_track = state.track_name
            old_title = state.session_title
            state.karts.clear()
            state.category = old_category
            state.track_name = old_track
            state.session_title = old_title
        if new_key:
            current_session_key = new_key

    # Don't forget the last session
    if last_timestamp:
        _snapshot_session(last_timestamp)

    if not sessions:
        return {"status": "ok", "message": "No sessions found in recording", "sessions": 0, "laps": 0}

    # Delete existing race_logs for this circuit+date (cascade deletes kart_laps)
    day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    deleted = await db.execute(
        delete(RaceLog).where(
            RaceLog.circuit_id == body.circuit_id,
            RaceLog.race_date >= day_start,
            RaceLog.race_date < day_end,
        )
    )
    deleted_count = deleted.rowcount
    logger.info(f"Deleted {deleted_count} existing race_logs for {circuit.name} on {body.date}")

    # Insert new race_logs and kart_laps
    total_laps = 0
    total_sessions = 0

    for session in sessions:
        kart_laps = session["kart_laps"]
        if not kart_laps:
            continue

        race_log = RaceLog(
            circuit_id=body.circuit_id,
            user_id=None,
            race_date=session["timestamp"].replace(tzinfo=timezone.utc)
                if session["timestamp"].tzinfo is None else session["timestamp"],
            session_name=session["session_name"],
            total_karts=len(kart_laps),
        )
        db.add(race_log)
        await db.flush()  # get race_log.id

        session_laps = 0
        for kart_number, data in kart_laps.items():
            valid_set = {(vl["totalLap"], vl["lapTime"]) for vl in data["valid_laps"]}
            for lap in data["all_laps"]:
                db.add(KartLap(
                    race_log_id=race_log.id,
                    kart_number=kart_number,
                    team_name=data["team_name"],
                    driver_name=lap.get("driverName", ""),
                    lap_number=lap["totalLap"],
                    lap_time_ms=lap["lapTime"],
                    is_valid=(lap["totalLap"], lap["lapTime"]) in valid_set,
                ))
                session_laps += 1

        total_laps += session_laps
        total_sessions += 1
        logger.info(f"  Session '{session['session_name']}': {len(kart_laps)} karts, {session_laps} laps")

    await db.commit()

    msg = (f"Reprocessed {circuit.name} {body.date}: "
           f"{total_sessions} sessions, {total_laps} laps "
           f"(replaced {deleted_count} old race_logs)")
    logger.info(msg)
    return {
        "status": "ok",
        "message": msg,
        "sessions": total_sessions,
        "laps": total_laps,
        "deleted": deleted_count,
    }
