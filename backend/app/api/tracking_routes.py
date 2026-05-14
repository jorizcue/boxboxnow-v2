"""Read-only tracking endpoints surfaced to any authenticated user.

The matching admin endpoints (write track config, import from OSM)
live in `admin_routes.py` because they require admin authorization
and share the rest of the admin scaffolding.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_routes import get_current_user
from app.models.database import get_db
from app.models.pydantic_models import TrackConfigOut
from app.models.schemas import Circuit, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tracking", tags=["tracking"])


def _polyline_to_list(raw: str | None) -> list[list[float]] | None:
    """JSON polyline → list[list[float]] or None if missing/invalid."""
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except Exception:
        return None
    if not isinstance(parsed, list):
        return None
    out: list[list[float]] = []
    for pt in parsed:
        if isinstance(pt, (list, tuple)) and len(pt) == 2:
            try:
                out.append([float(pt[0]), float(pt[1])])
            except (TypeError, ValueError):
                continue
    return out or None


@router.get("/circuits/{circuit_id}/track-config", response_model=TrackConfigOut)
async def get_track_config(
    circuit_id: int,
    _user: User = Depends(get_current_user),  # any authed user can read
    db: AsyncSession = Depends(get_db),
):
    """Return the polyline + sectors + pit lane for a circuit.

    Used by the live Tracking module on every dashboard load. Returns
    all `None` fields when the operator hasn't traced the circuit yet —
    the frontend renders an empty-state in that case.
    """
    result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
    circuit = result.scalar_one_or_none()
    if not circuit:
        raise HTTPException(404, "Circuit not found")

    return TrackConfigOut(
        track_polyline=_polyline_to_list(circuit.track_polyline),
        track_length_m=circuit.track_length_m,
        s1_distance_m=circuit.s1_distance_m,
        s2_distance_m=circuit.s2_distance_m,
        s3_distance_m=circuit.s3_distance_m,
        pit_entry_distance_m=circuit.pit_entry_distance_m,
        pit_exit_distance_m=circuit.pit_exit_distance_m,
        pit_entry_lat=circuit.pit_entry_lat,
        pit_entry_lon=circuit.pit_entry_lon,
        pit_exit_lat=circuit.pit_exit_lat,
        pit_exit_lon=circuit.pit_exit_lon,
        pit_lane_polyline=_polyline_to_list(circuit.pit_lane_polyline),
        pit_lane_length_m=circuit.pit_lane_length_m,
        pit_box_distance_m=circuit.pit_box_distance_m,
        meta_distance_m=circuit.meta_distance_m or 0.0,
        default_direction=circuit.default_direction or "forward",
    )
