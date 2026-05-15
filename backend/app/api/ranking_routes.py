"""Driver-ranking API.

Two access tiers:
  * Admin-only management endpoints under `/api/admin/ranking/*`
    (list/search/merge drivers, trigger re-processing, etc).
  * One read endpoint usable by any authenticated user:
    `POST /api/ranking/lookup` — bulk-lookup ratings by raw Apex name.
    Used by the TeamEditor pre-race panel to colour-rank drivers and
    by the auto-sort-teams feature in the Config view.

The actual ranking algorithm lives in
`app/services/ranking/processor.py`. These routes are thin wrappers
that authenticate the request and pass it through.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_routes import require_admin, get_current_user
from app.models.database import get_db
from app.models.schemas import User
from app.services.ranking.processor import (
    get_top_drivers, search_drivers, lookup_ratings_by_names,
    merge_drivers, process_pending,
    list_circuits_with_ratings, get_driver_detail, reset_ratings,
)

logger = logging.getLogger(__name__)


admin_router = APIRouter(prefix="/api/admin/ranking", tags=["ranking-admin"])
public_router = APIRouter(prefix="/api/ranking", tags=["ranking"])


# ─── Public-ish (authenticated) ─────────────────────────────────────────


class LookupRequest(BaseModel):
    names: list[str]


@public_router.post("/lookup")
async def lookup_ratings(
    payload: LookupRequest,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk lookup. Returns one row per input name in the same order:
    `{name, matched, rating, rd, sessions, canonical_name, driver_id}`.

    `matched=False` ⇒ this driver name isn't in our DB yet (rookie).
    The frontend falls back to the default rating (1500) and a
    "unrated" badge in that case.
    """
    if not payload.names:
        return {"results": []}
    rows = await lookup_ratings_by_names(payload.names, db)
    return {"results": rows}


# ─── Admin: read ────────────────────────────────────────────────────────


@admin_router.get("/top")
async def admin_top(
    limit: int | None = None,
    min_sessions: int = 2,
    circuit: str | None = None,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Top N drivers ranked by Glicko-2 rating. `min_sessions` filters
    out one-off entries whose rating is dominated by their initial RD.

    `circuit` switches between the global table and the per-circuit
    one. Omit (or send empty string) for global; pass a circuit name
    for the per-circuit ranking."""
    circ = (circuit or "").strip() or None
    rows = await get_top_drivers(db, limit=limit, min_sessions=min_sessions, circuit=circ)
    return {"drivers": rows, "circuit": circ}


@admin_router.get("/circuits")
async def admin_circuits(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List circuits that have at least one per-circuit rating row.
    Drives the circuit dropdown in the admin Ranking panel."""
    rows = await list_circuits_with_ratings(db)
    return {"circuits": rows}


@admin_router.get("/driver/{driver_id}")
async def admin_driver_detail(
    driver_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Full per-driver detail: global rating, every per-circuit
    rating, aliases, all rating-history entries (for the chart), and
    the last 20 session results. One round-trip ⇒ the admin modal
    renders everything without follow-up calls."""
    detail = await get_driver_detail(driver_id, db)
    if detail is None:
        raise HTTPException(404, "Driver not found")
    return detail


@admin_router.get("/search")
async def admin_search(
    q: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Substring search on canonical name. Used by the merge dialog
    to find the candidate driver to merge INTO."""
    rows = await search_drivers(q, db)
    return {"drivers": rows}


# ─── Admin: write ───────────────────────────────────────────────────────


class MergeRequest(BaseModel):
    into_driver_id: int
    from_driver_id: int


@admin_router.post("/merge")
async def admin_merge(
    payload: MergeRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Merge two driver rows. Moves all aliases + session results
    from `from_driver_id` onto `into_driver_id`, then deletes the
    source. The destination driver KEEPS its current rating — for a
    clean re-rating, truncate `driver_ratings` + `rating_history` +
    `processed_logs` and trigger /reprocess."""
    result = await merge_drivers(payload.into_driver_id, payload.from_driver_id, db)
    if not result.get("ok"):
        raise HTTPException(400, result.get("reason", "merge_failed"))
    return result


@admin_router.post("/reprocess")
async def admin_reprocess(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trigger an incremental backfill: parse every recording in
    `data/recordings/` that isn't in `processed_logs` yet. Safe to call
    while the app is running — uses the same idempotent path as the
    startup task."""
    recordings_dir = _recordings_dir()
    if recordings_dir is None:
        raise HTTPException(500, "Recordings dir not found")
    result = await process_pending(db, recordings_dir)
    return result


class ResetRequest(BaseModel):
    wipe_drivers: bool = False
    reprocess: bool = True


@admin_router.post("/reset")
async def admin_reset(
    payload: ResetRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Wipe ratings + history + session_results + processed_logs and
    re-run the backfill from scratch. Optionally also wipes the
    drivers table (loses admin merges). Use after refining the
    Glicko-2 algorithm or the parser — preserves no rating
    calculation but is fully reproducible from the raw logs.

    Returns the row counts deleted and the reprocess result. Be aware
    the reprocess step is synchronous in the request; for a fresh DB
    it can take a couple of minutes."""
    counts = await reset_ratings(db, wipe_drivers=payload.wipe_drivers)
    result: dict[str, Any] = {"deleted": counts}
    if payload.reprocess:
        recordings_dir = _recordings_dir()
        if recordings_dir is None:
            raise HTTPException(500, "Recordings dir not found")
        rerun = await process_pending(db, recordings_dir)
        result["reprocess"] = rerun
    return result


# ─── Helpers ────────────────────────────────────────────────────────────


def _recordings_dir() -> Path | None:
    """Locate `data/recordings/`. Tries the project-relative path used
    by the running app first (`/app/data/recordings` in the container),
    falls back to a sibling of this file for local dev."""
    candidates = [
        Path("/app/data/recordings"),
        Path(__file__).resolve().parents[3] / "data" / "recordings",
    ]
    for c in candidates:
        if c.is_dir():
            return c
    return None
