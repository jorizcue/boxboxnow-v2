"""REST API routes for kart analytics."""

import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func as sqlfunc

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
