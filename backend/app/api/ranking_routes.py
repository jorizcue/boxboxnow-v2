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
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_routes import require_admin, get_current_user
from app.models.database import get_db
from app.models.schemas import User, SessionResult, RankingSessionOverride
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


# ─── Admin: session-type override ──────────────────────────────────────


@admin_router.get("/sessions")
async def admin_sessions(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all distinct recorded sessions with their stored session_type
    and any admin override (forced_type). Ordered by log_date DESC,
    circuit_name, session_seq.

    Each item: {circuit_name, log_date, session_seq, title1, title2,
                session_type, team_mode, driver_count, forced_type|null}.
    """
    # Aggregate session results grouped by the 5 session-identity columns.
    agg = (
        await db.execute(
            select(
                SessionResult.circuit_name,
                SessionResult.log_date,
                SessionResult.session_seq,
                SessionResult.title1,
                SessionResult.title2,
                SessionResult.session_type,
                SessionResult.team_mode,
                func.count(SessionResult.driver_id).label("driver_count"),
            )
            .group_by(
                SessionResult.circuit_name,
                SessionResult.log_date,
                SessionResult.session_seq,
                SessionResult.title1,
                SessionResult.title2,
                SessionResult.session_type,
                SessionResult.team_mode,
            )
            .order_by(
                SessionResult.log_date.desc(),
                SessionResult.circuit_name,
                SessionResult.session_seq,
            )
        )
    ).all()

    # Fetch all overrides so we can do the left-join in Python (avoids
    # SQLite dialect issues with JOIN over aggregate queries).
    override_rows = (await db.execute(select(RankingSessionOverride))).scalars().all()
    override_map: dict[tuple[str, str, int], str] = {
        (ov.circuit_name, ov.log_date, ov.session_seq): ov.forced_type
        for ov in override_rows
    }

    result = []
    for row in agg:
        key = (row.circuit_name, row.log_date, row.session_seq)
        result.append(
            {
                "circuit_name": row.circuit_name,
                "log_date": row.log_date,
                "session_seq": row.session_seq,
                "title1": row.title1,
                "title2": row.title2,
                "session_type": row.session_type,
                "team_mode": row.team_mode,
                "driver_count": row.driver_count,
                "forced_type": override_map.get(key),
            }
        )
    return result


class SessionTypeRequest(BaseModel):
    circuit_name: str
    log_date: str
    session_seq: int
    forced_type: Literal["race", "pace"]


@admin_router.post("/session-type")
async def admin_set_session_type(
    payload: SessionTypeRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Upsert a RankingSessionOverride for the given session.

    Snapshots title1/title2 from an existing SessionResult if one is
    found for the (circuit_name, log_date, session_seq) triple.
    Returns the saved override row as a dict.
    """
    # Snapshot titles from SessionResult if available.
    sr = (
        await db.execute(
            select(SessionResult)
            .where(
                SessionResult.circuit_name == payload.circuit_name,
                SessionResult.log_date == payload.log_date,
                SessionResult.session_seq == payload.session_seq,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    title1 = sr.title1 if sr else ""
    title2 = sr.title2 if sr else ""

    # Upsert: find existing row or create new.
    existing = (
        await db.execute(
            select(RankingSessionOverride).where(
                RankingSessionOverride.circuit_name == payload.circuit_name,
                RankingSessionOverride.log_date == payload.log_date,
                RankingSessionOverride.session_seq == payload.session_seq,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.forced_type = payload.forced_type
        existing.title1 = title1
        existing.title2 = title2
        await db.flush()
        ov = existing
    else:
        ov = RankingSessionOverride(
            circuit_name=payload.circuit_name,
            log_date=payload.log_date,
            session_seq=payload.session_seq,
            forced_type=payload.forced_type,
            title1=title1,
            title2=title2,
        )
        db.add(ov)
        await db.flush()

    return {
        "id": ov.id,
        "circuit_name": ov.circuit_name,
        "log_date": ov.log_date,
        "session_seq": ov.session_seq,
        "forced_type": ov.forced_type,
        "title1": ov.title1,
        "title2": ov.title2,
    }


@admin_router.delete("/session-type")
async def admin_delete_session_type(
    circuit_name: str,
    log_date: str,
    session_seq: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete the RankingSessionOverride for the given session.

    Idempotent: returns 200 even if no row existed.
    """
    await db.execute(
        delete(RankingSessionOverride).where(
            RankingSessionOverride.circuit_name == circuit_name,
            RankingSessionOverride.log_date == log_date,
            RankingSessionOverride.session_seq == session_seq,
        )
    )
    return {"ok": True}


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
