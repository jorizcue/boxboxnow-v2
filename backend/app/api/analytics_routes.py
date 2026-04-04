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


@router.get("/kart-stats", response_model=list[KartStatsOut])
async def get_kart_stats(
    circuit_id: int,
    date_from: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated kart performance stats for a circuit within a date range."""
    await _check_circuit_access(user, circuit_id, db)
    # Default: last 7 days
    now = datetime.now(timezone.utc)
    if date_from:
        dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
    else:
        dt_from = now - timedelta(days=7)
    if date_to:
        dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc, hour=23, minute=59, second=59)
    else:
        dt_to = now

    # Get race_log ids in range for this circuit
    result = await db.execute(
        select(RaceLog.id).where(
            RaceLog.circuit_id == circuit_id,
            RaceLog.race_date >= dt_from,
            RaceLog.race_date <= dt_to,
        )
    )
    race_log_ids = [r[0] for r in result.all()]

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

        # Filter outliers: remove laps >10% away from the mean
        # (rain, spins, off-tracks, safety cars, etc.)
        raw_mean = sum(valid) / len(valid)
        threshold = raw_mean * 0.10
        filtered = [t for t in valid if abs(t - raw_mean) <= threshold]
        if not filtered:
            filtered = valid  # fallback if everything got filtered

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
