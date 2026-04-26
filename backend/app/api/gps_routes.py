"""GPS Telemetry endpoints — save and retrieve lap data from RaceBox/phone GPS."""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.models.database import get_db
from app.models.schemas import GpsTelemetryLap, RaceSession, User
from app.models.pydantic_models import GpsLapCreate, GpsLapOut, GpsLapBatchCreate
from app.api.auth_routes import get_current_user

router = APIRouter(prefix="/api/gps", tags=["gps-telemetry"])


@router.post("/laps", response_model=list[GpsLapOut])
async def save_laps(
    data: GpsLapBatchCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save one or more GPS laps (typically called when session ends or periodically).

    Auto-resolves both race_session_id AND kart_number / circuit_id from the
    user's active session, so the mobile client only needs to send the
    telemetry arrays.
    """
    active_session_id: int | None = None
    active_kart_number: int | None = None
    active_circuit_id: int | None = None
    try:
        result = await db.execute(
            select(RaceSession.id, RaceSession.our_kart_number, RaceSession.circuit_id)
            .where(RaceSession.user_id == user.id, RaceSession.is_active == True)
            .limit(1)
        )
        row_rs = result.first()
        if row_rs:
            active_session_id = row_rs.id
            active_kart_number = row_rs.our_kart_number
            active_circuit_id = row_rs.circuit_id
    except Exception:
        pass  # Non-critical — save telemetry even without session link

    results = []
    for lap in data.laps:
        row = GpsTelemetryLap(
            user_id=user.id,
            circuit_id=lap.circuit_id or active_circuit_id,
            race_session_id=lap.race_session_id or active_session_id,
            kart_number=lap.kart_number or active_kart_number,
            lap_number=lap.lap_number,
            duration_ms=lap.duration_ms,
            total_distance_m=lap.total_distance_m,
            max_speed_kmh=lap.max_speed_kmh,
            distances_json=json.dumps(lap.distances) if lap.distances else None,
            timestamps_json=json.dumps(lap.timestamps) if lap.timestamps else None,
            positions_json=json.dumps(lap.positions) if lap.positions else None,
            speeds_json=json.dumps(lap.speeds) if lap.speeds else None,
            gforce_lat_json=json.dumps(lap.gforce_lat) if lap.gforce_lat else None,
            gforce_lon_json=json.dumps(lap.gforce_lon) if lap.gforce_lon else None,
            gps_source=lap.gps_source,
        )
        db.add(row)
        results.append(row)

    await db.commit()
    for r in results:
        await db.refresh(r)

    return [_to_out(r, include_traces=False) for r in results]


@router.get("/laps", response_model=list[GpsLapOut])
async def list_laps(
    circuit_id: int | None = Query(None),
    race_session_id: int | None = Query(None),
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List GPS laps for the current user (summary only, no trace data)."""
    q = select(GpsTelemetryLap).where(GpsTelemetryLap.user_id == user.id)
    if circuit_id is not None:
        q = q.where(GpsTelemetryLap.circuit_id == circuit_id)
    if race_session_id is not None:
        q = q.where(GpsTelemetryLap.race_session_id == race_session_id)
    q = q.order_by(desc(GpsTelemetryLap.recorded_at)).limit(limit)

    result = await db.execute(q)
    rows = result.scalars().all()
    return [_to_out(r, include_traces=False) for r in rows]


@router.get("/laps/window", response_model=list[GpsLapOut])
async def list_laps_window(
    circuit_id: int = Query(...),
    kart_number: int | None = Query(None),
    start: datetime = Query(..., description="ISO timestamp — laps recorded after this"),
    end: datetime = Query(..., description="ISO timestamp — laps recorded before this"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return GPS laps **with traces** that finished within [start, end]
    on a given circuit/kart. This is the replay-sync endpoint: the web
    replay calls it once when a session loads, then animates the marker
    using the returned positions/timestamps arrays.

    `recorded_at` is the absolute UTC time the lap was uploaded — for the
    iOS/Android client this happens immediately after the finish-line
    crossing, so it's a tight upper bound on the lap's end time. The
    lap's start is `recorded_at - duration_ms`.

    The endpoint is open to any authenticated user (not just admins) so
    pilots can see their own historic stints overlaid on a replay without
    needing the admin role.
    """
    q = (
        select(GpsTelemetryLap)
        .where(GpsTelemetryLap.circuit_id == circuit_id)
        .where(GpsTelemetryLap.recorded_at >= start)
        .where(GpsTelemetryLap.recorded_at <= end)
    )
    if kart_number is not None:
        q = q.where(GpsTelemetryLap.kart_number == kart_number)
    # Non-admin users only see their own telemetry
    if not getattr(user, "is_admin", False):
        q = q.where(GpsTelemetryLap.user_id == user.id)
    q = q.order_by(GpsTelemetryLap.recorded_at)

    result = await db.execute(q)
    rows = result.scalars().all()
    return [_to_out(r, include_traces=True) for r in rows]


@router.get("/laps/{lap_id}", response_model=GpsLapOut)
async def get_lap_detail(
    lap_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single GPS lap with full trace data."""
    result = await db.execute(
        select(GpsTelemetryLap).where(
            GpsTelemetryLap.id == lap_id,
            GpsTelemetryLap.user_id == user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Lap not found")
    return _to_out(row, include_traces=True)


@router.delete("/laps/{lap_id}")
async def delete_lap(
    lap_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a GPS lap."""
    result = await db.execute(
        select(GpsTelemetryLap).where(
            GpsTelemetryLap.id == lap_id,
            GpsTelemetryLap.user_id == user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Lap not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/stats")
async def gps_stats(
    circuit_id: int | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated stats for the user's GPS laps."""
    q = select(
        func.count(GpsTelemetryLap.id).label("total_laps"),
        func.min(GpsTelemetryLap.duration_ms).label("best_lap_ms"),
        func.avg(GpsTelemetryLap.duration_ms).label("avg_lap_ms"),
        func.max(GpsTelemetryLap.max_speed_kmh).label("top_speed_kmh"),
        func.sum(GpsTelemetryLap.total_distance_m).label("total_distance_m"),
    ).where(GpsTelemetryLap.user_id == user.id)

    if circuit_id is not None:
        q = q.where(GpsTelemetryLap.circuit_id == circuit_id)

    result = await db.execute(q)
    row = result.one()

    return {
        "total_laps": row.total_laps or 0,
        "best_lap_ms": row.best_lap_ms,
        "avg_lap_ms": round(row.avg_lap_ms) if row.avg_lap_ms else None,
        "top_speed_kmh": row.top_speed_kmh,
        "total_distance_km": round(row.total_distance_m / 1000, 1) if row.total_distance_m else 0,
    }


def _to_out(row: GpsTelemetryLap, include_traces: bool) -> GpsLapOut:
    out = GpsLapOut(
        id=row.id,
        user_id=row.user_id,
        circuit_id=row.circuit_id,
        race_session_id=row.race_session_id,
        kart_number=row.kart_number,
        lap_number=row.lap_number,
        duration_ms=row.duration_ms,
        total_distance_m=row.total_distance_m,
        max_speed_kmh=row.max_speed_kmh,
        gps_source=row.gps_source,
        recorded_at=row.recorded_at,
    )
    if include_traces:
        out.distances = json.loads(row.distances_json) if row.distances_json else None
        out.timestamps = json.loads(row.timestamps_json) if row.timestamps_json else None
        out.positions = json.loads(row.positions_json) if row.positions_json else None
        out.speeds = json.loads(row.speeds_json) if row.speeds_json else None
        out.gforce_lat = json.loads(row.gforce_lat_json) if row.gforce_lat_json else None
        out.gforce_lon = json.loads(row.gforce_lon_json) if row.gforce_lon_json else None
    return out
