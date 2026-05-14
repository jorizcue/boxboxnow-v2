"""Glue between the log parser and the database.

Public surface used by the rest of the app:

  * `process_log_file(path, circuit, log_date, db)`
      Parse one Apex log → insert `session_results` + update Glicko-2
      ratings for every driver in it. Idempotent: if `processed_logs`
      already has the (circuit, date) row, returns immediately.

  * `process_pending(db)`
      Scan `data/recordings/` for log files not yet in
      `processed_logs` and process them all in date order. This is
      what the startup task and the admin "rerun" endpoint call.

  * `lookup_ratings_by_names(names, db)`
      Resolve a list of RAW Apex driver names (e.g. as they appear in
      TeamEditor) to their current rating + RD. Unknown names get the
      Glicko-2 default. Drives the pre-race team panel.

  * `get_top_drivers(limit, min_sessions, db)`
      Ranking page query. Filters out drivers below `min_sessions` so
      the leaderboard isn't polluted by one-off entries with
      undefendable ratings.
"""
from __future__ import annotations

import logging
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import (
    Driver, DriverAlias, DriverRating, SessionResult, RatingHistory, ProcessedLog,
)
from .glicko2 import (
    Glicko2State, update, DEFAULT_RATING, DEFAULT_RD, DEFAULT_VOLATILITY,
)
from .log_parser import parse_log, SessionDriverResult
from .normalizer import normalize_name, display_form

logger = logging.getLogger(__name__)

# Sessions with fewer than this many drivers don't get rating updates
# (the math is meaningless with < 2 competitors, and we want to skip
# "practice with one driver" sessions). Note: a single SESSION groups
# all drivers by (circuit, log_date, title1, title2) — the parser
# already emits one SessionDriverResult per (session, driver).
MIN_DRIVERS_PER_SESSION = 3

# Drivers with fewer than this many laps in a session are excluded
# from the rating update. Filters out drivers who only did an out/in
# lap (e.g. parade or DNS) and avoids tanking their rating because
# their "average" was a 3-minute pit-through.
MIN_LAPS_PER_DRIVER = 5


# ─── Driver canonicalisation helpers ─────────────────────────────────────


async def _resolve_or_create_driver(
    canonical_key: str,
    raw_name: str,
    db: AsyncSession,
) -> Driver:
    """Find (or create) the Driver row for a normalised name. Also adds
    the raw_name as an alias if we haven't seen it before."""
    res = await db.execute(select(Driver).where(Driver.normalized_key == canonical_key))
    driver = res.scalar_one_or_none()
    if driver is None:
        driver = Driver(
            canonical_name=display_form(canonical_key),
            normalized_key=canonical_key,
        )
        db.add(driver)
        await db.flush()
        # Seed default rating row so the lookup path doesn't need to
        # check for missing rows.
        db.add(DriverRating(
            driver_id=driver.id,
            rating=DEFAULT_RATING,
            rd=DEFAULT_RD,
            volatility=DEFAULT_VOLATILITY,
        ))
        await db.flush()
    # Record this raw form as an alias if it's new.
    if raw_name and raw_name != driver.canonical_name:
        res2 = await db.execute(
            select(DriverAlias).where(DriverAlias.alias == raw_name)
        )
        if res2.scalar_one_or_none() is None:
            db.add(DriverAlias(driver_id=driver.id, alias=raw_name))
    return driver


async def _resolve_driver_by_alias(name: str, db: AsyncSession) -> Driver | None:
    """Lookup-only resolver. Try (a) exact alias match, (b) normalised
    key match. Returns None if neither hits."""
    if not name:
        return None
    # Try alias first (the operator may type the exact form they see)
    res = await db.execute(select(DriverAlias).where(DriverAlias.alias == name))
    a = res.scalar_one_or_none()
    if a is not None:
        res2 = await db.execute(select(Driver).where(Driver.id == a.driver_id))
        return res2.scalar_one_or_none()
    # Fall back to normalised key
    canon = normalize_name(name)
    if not canon:
        return None
    res3 = await db.execute(select(Driver).where(Driver.normalized_key == canon))
    return res3.scalar_one_or_none()


# ─── Per-session ingestion + rating update ────────────────────────────────


async def _apply_session(
    session_drivers: list[SessionDriverResult],
    db: AsyncSession,
):
    """One session's worth of driver results → DB rows + Glicko-2 updates."""
    if len(session_drivers) < MIN_DRIVERS_PER_SESSION:
        return

    # Filter to drivers with enough laps to be ratable.
    rated_drivers = [s for s in session_drivers if s.total_laps >= MIN_LAPS_PER_DRIVER]
    if len(rated_drivers) < MIN_DRIVERS_PER_SESSION:
        return

    # ── Kart bias correction ──
    # In endurance, kart mechanical differences (setup, wear) skew the
    # avg lap by up to ±1 s. We compute the per-kart average across
    # drivers that ran it, then subtract from each driver's avg to get
    # a kart-corrected pace. This is a single-pass approximation — a
    # purist approach would iterate driver-skill ⇄ kart-bias, but for
    # rating purposes the first-order fix is plenty.
    by_kart_avg: dict[int, list[float]] = {}
    for s in rated_drivers:
        if s.kart_number is not None:
            by_kart_avg.setdefault(s.kart_number, []).append(s.avg_lap_ms)
    kart_avg = {k: statistics.mean(v) for k, v in by_kart_avg.items()}
    field_avg = statistics.mean(s.avg_lap_ms for s in rated_drivers)
    kart_bias = {k: avg - field_avg for k, avg in kart_avg.items()}

    # Resolve or create drivers and persist SessionResult rows.
    driver_objs: list[tuple[SessionDriverResult, Driver, SessionResult]] = []
    for sd in rated_drivers:
        driver = await _resolve_or_create_driver(sd.raw_canonical, sd.raw_name_sample, db)
        bias = kart_bias.get(sd.kart_number, 0.0) if sd.kart_number is not None else 0.0
        corrected = sd.avg_lap_ms - bias

        # Upsert SessionResult — uq constraint on
        # (circuit, date, title1, title2, driver) means we should skip
        # if already present (a previous successful run for this log).
        res = await db.execute(
            select(SessionResult).where(
                SessionResult.circuit_name == sd.circuit_name,
                SessionResult.log_date == sd.log_date,
                SessionResult.title1 == sd.title1,
                SessionResult.title2 == sd.title2,
                SessionResult.driver_id == driver.id,
            )
        )
        existing = res.scalar_one_or_none()
        if existing is not None:
            continue  # idempotent: already processed
        sr = SessionResult(
            circuit_name=sd.circuit_name,
            log_date=sd.log_date,
            title1=sd.title1,
            title2=sd.title2,
            driver_id=driver.id,
            kart_number=sd.kart_number,
            team_name=sd.team_name or "",
            total_laps=sd.total_laps,
            best_lap_ms=sd.best_lap_ms,
            avg_lap_ms=sd.avg_lap_ms,
            median_lap_ms=sd.median_lap_ms,
            kart_bias_ms=bias,
            corrected_avg_ms=corrected,
        )
        db.add(sr)
        await db.flush()
        driver_objs.append((sd, driver, sr))

    if len(driver_objs) < MIN_DRIVERS_PER_SESSION:
        return

    # Sort by corrected pace — faster = better.
    driver_objs.sort(key=lambda t: t[2].corrected_avg_ms)
    for i, (_, _, sr) in enumerate(driver_objs):
        sr.final_position = i + 1

    # ── Glicko-2 rating update ──
    # Load current ratings.
    pre: dict[int, Glicko2State] = {}
    for _, driver, _ in driver_objs:
        res = await db.execute(select(DriverRating).where(DriverRating.driver_id == driver.id))
        row = res.scalar_one()
        pre[driver.id] = Glicko2State(rating=row.rating, rd=row.rd, volatility=row.volatility)

    # Build pairwise outcomes for each driver vs every other driver in
    # the session. Outcome: 1 if I'm faster, 0 if slower, 0.5 if tie.
    log_date_obj: datetime | None = None
    try:
        log_date_obj = datetime.strptime(driver_objs[0][2].log_date, "%Y-%m-%d")
    except Exception:
        log_date_obj = None

    for i, (sd_i, drv_i, sr_i) in enumerate(driver_objs):
        opponents: list[tuple[Glicko2State, float]] = []
        for j, (sd_j, drv_j, sr_j) in enumerate(driver_objs):
            if i == j:
                continue
            if sr_i.corrected_avg_ms < sr_j.corrected_avg_ms:
                score = 1.0
            elif sr_i.corrected_avg_ms > sr_j.corrected_avg_ms:
                score = 0.0
            else:
                score = 0.5
            opponents.append((pre[drv_j.id], score))

        new_state = update(pre[drv_i.id], opponents)
        # Persist updated rating + history row
        res = await db.execute(select(DriverRating).where(DriverRating.driver_id == drv_i.id))
        rating_row = res.scalar_one()
        prev_rating = rating_row.rating
        prev_rd = rating_row.rd
        rating_row.rating = new_state.rating
        rating_row.rd = new_state.rd
        rating_row.volatility = new_state.volatility
        rating_row.sessions_count = (rating_row.sessions_count or 0) + 1
        if log_date_obj is not None:
            rating_row.last_session_at = log_date_obj
        rating_row.updated_at = datetime.now(timezone.utc)

        db.add(RatingHistory(
            driver_id=drv_i.id,
            session_result_id=sr_i.id,
            rating_before=prev_rating,
            rd_before=prev_rd,
            rating_after=new_state.rating,
            rd_after=new_state.rd,
            delta=new_state.rating - prev_rating,
        ))

        drv_i.sessions_count = (drv_i.sessions_count or 0) + 1
        drv_i.total_laps = (drv_i.total_laps or 0) + sd_i.total_laps
        drv_i.updated_at = datetime.now(timezone.utc)


# ─── Public entry points ─────────────────────────────────────────────────


async def process_log_file(
    path: Path,
    circuit_name: str,
    log_date: str,
    db: AsyncSession,
) -> dict:
    """Parse one log, persist its sessions, run the rating math.

    Idempotent: if (circuit_name, log_date) is already in
    `processed_logs`, returns immediately with `{"skipped": True}`.

    Commits at the end (or rolls back on error)."""
    res = await db.execute(
        select(ProcessedLog).where(
            ProcessedLog.circuit_name == circuit_name,
            ProcessedLog.log_date == log_date,
        )
    )
    if res.scalar_one_or_none() is not None:
        return {"skipped": True, "reason": "already_processed"}

    # Parse and bucket by session.
    by_session: dict[tuple[str, str], list[SessionDriverResult]] = {}
    for sd in parse_log(path, circuit_name, log_date):
        by_session.setdefault((sd.title1, sd.title2), []).append(sd)

    sessions_count = 0
    laps_count = 0
    for (t1, t2), drivers in by_session.items():
        try:
            await _apply_session(drivers, db)
            sessions_count += 1
            laps_count += sum(d.total_laps for d in drivers)
        except Exception:
            logger.exception("ranking._apply_session failed for %s/%s/%s/%s",
                             circuit_name, log_date, t1, t2)

    db.add(ProcessedLog(
        circuit_name=circuit_name,
        log_date=log_date,
        sessions_count=sessions_count,
        laps_count=laps_count,
    ))
    await db.commit()
    return {"skipped": False, "sessions": sessions_count, "laps": laps_count}


async def process_pending(db: AsyncSession, recordings_dir: Path) -> dict:
    """Scan `recordings_dir/<Circuit>/<YYYY-MM-DD>.log[.gz]` and process
    every file not yet in `processed_logs`. Done in date order so the
    rating history is built chronologically."""
    if not recordings_dir.is_dir():
        return {"processed": 0, "skipped": 0, "error": "no_recordings_dir"}

    res = await db.execute(select(ProcessedLog.circuit_name, ProcessedLog.log_date))
    done = {(r[0], r[1]) for r in res.all()}

    candidates: list[tuple[str, str, Path]] = []
    for circuit_dir in recordings_dir.iterdir():
        if not circuit_dir.is_dir():
            continue
        for log_path in circuit_dir.iterdir():
            name = log_path.name
            if name.endswith(".log.gz"):
                log_date = name[:-len(".log.gz")]
            elif name.endswith(".log"):
                log_date = name[:-len(".log")]
            else:
                continue
            # Date sanity
            if len(log_date) != 10 or log_date[4] != "-" or log_date[7] != "-":
                continue
            if (circuit_dir.name, log_date) in done:
                continue
            candidates.append((circuit_dir.name, log_date, log_path))

    candidates.sort(key=lambda t: (t[1], t[0]))   # date asc, then circuit

    processed = 0
    skipped = 0
    for circuit, log_date, path in candidates:
        try:
            result = await process_log_file(path, circuit, log_date, db)
            if result.get("skipped"):
                skipped += 1
            else:
                processed += 1
        except Exception:
            logger.exception("ranking.process_log_file failed for %s/%s", circuit, log_date)
            await db.rollback()

    return {"processed": processed, "skipped": skipped, "total_candidates": len(candidates)}


async def lookup_ratings_by_names(
    names: Iterable[str],
    db: AsyncSession,
) -> list[dict]:
    """Pre-race team panel lookup. Input: a list of raw Apex driver
    names (possibly with the `[0:23]` stint suffix). Output: a list of
    dicts with rating info per name, preserving input order.

    Unknown drivers get a `None` rating + the Glicko-2 default — the
    caller decides whether to fall back to the default rating or
    display a "rookie" marker."""
    out: list[dict] = []
    for raw in names:
        clean = (raw or "").strip()
        if not clean:
            out.append({"name": raw, "matched": False, "rating": None, "rd": None,
                        "sessions": 0, "driver_id": None, "canonical_name": None})
            continue
        driver = await _resolve_driver_by_alias(clean, db)
        if driver is None:
            out.append({"name": raw, "matched": False, "rating": None, "rd": None,
                        "sessions": 0, "driver_id": None,
                        "canonical_name": display_form(normalize_name(clean))})
            continue
        rres = await db.execute(select(DriverRating).where(DriverRating.driver_id == driver.id))
        rating_row = rres.scalar_one_or_none()
        out.append({
            "name": raw,
            "matched": True,
            "driver_id": driver.id,
            "canonical_name": driver.canonical_name,
            "rating": rating_row.rating if rating_row else DEFAULT_RATING,
            "rd": rating_row.rd if rating_row else DEFAULT_RD,
            "sessions": rating_row.sessions_count if rating_row else 0,
        })
    return out


async def get_top_drivers(
    db: AsyncSession,
    limit: int = 100,
    min_sessions: int = 2,
) -> list[dict]:
    """Ranking page query. Sorted by rating descending."""
    res = await db.execute(
        select(Driver, DriverRating)
        .join(DriverRating, DriverRating.driver_id == Driver.id)
        .where(DriverRating.sessions_count >= min_sessions)
        .order_by(DriverRating.rating.desc())
        .limit(limit)
    )
    out: list[dict] = []
    for rank, (driver, rating) in enumerate(res.all(), start=1):
        out.append({
            "rank": rank,
            "driver_id": driver.id,
            "canonical_name": driver.canonical_name,
            "rating": round(rating.rating, 1),
            "rd": round(rating.rd, 1),
            "volatility": round(rating.volatility, 4),
            "sessions_count": rating.sessions_count,
            "total_laps": driver.total_laps,
            "last_session_at": rating.last_session_at.isoformat() if rating.last_session_at else None,
        })
    return out


async def search_drivers(query: str, db: AsyncSession, limit: int = 50) -> list[dict]:
    """Search drivers by name (case-insensitive, substring on the
    canonical name + on any alias). Used by the admin merge tool."""
    if not query:
        return []
    norm = normalize_name(query)
    if not norm:
        return []
    res = await db.execute(
        select(Driver, DriverRating)
        .outerjoin(DriverRating, DriverRating.driver_id == Driver.id)
        .where(Driver.normalized_key.contains(norm))
        .order_by(Driver.sessions_count.desc())
        .limit(limit)
    )
    return [
        {
            "driver_id": d.id,
            "canonical_name": d.canonical_name,
            "normalized_key": d.normalized_key,
            "sessions_count": d.sessions_count,
            "total_laps": d.total_laps,
            "rating": round(r.rating, 1) if r else DEFAULT_RATING,
            "rd": round(r.rd, 1) if r else DEFAULT_RD,
        }
        for d, r in res.all()
    ]


async def merge_drivers(into_id: int, from_id: int, db: AsyncSession) -> dict:
    """Admin tool: move all aliases + session_results from one driver
    onto another, then delete the source. Use when two canonical
    drivers turn out to be the same person (e.g. middle name vs not).

    Does NOT re-run Glicko-2 — the destination driver keeps its current
    rating. If you want a clean re-rating, truncate ratings + history
    and run the full backfill."""
    if into_id == from_id:
        return {"ok": False, "reason": "same_driver"}
    res = await db.execute(select(Driver).where(Driver.id == from_id))
    src = res.scalar_one_or_none()
    res = await db.execute(select(Driver).where(Driver.id == into_id))
    dst = res.scalar_one_or_none()
    if src is None or dst is None:
        return {"ok": False, "reason": "not_found"}

    # Move aliases
    aliases = await db.execute(select(DriverAlias).where(DriverAlias.driver_id == src.id))
    for a in aliases.scalars().all():
        a.driver_id = dst.id
    # Add a final alias for the source canonical
    if src.canonical_name and src.canonical_name != dst.canonical_name:
        check = await db.execute(
            select(DriverAlias).where(DriverAlias.alias == src.canonical_name)
        )
        if check.scalar_one_or_none() is None:
            db.add(DriverAlias(driver_id=dst.id, alias=src.canonical_name))

    # Move session_results + history
    srs = await db.execute(select(SessionResult).where(SessionResult.driver_id == src.id))
    for sr in srs.scalars().all():
        sr.driver_id = dst.id
    hist = await db.execute(select(RatingHistory).where(RatingHistory.driver_id == src.id))
    for h in hist.scalars().all():
        h.driver_id = dst.id

    dst.sessions_count = (dst.sessions_count or 0) + (src.sessions_count or 0)
    dst.total_laps = (dst.total_laps or 0) + (src.total_laps or 0)

    # Delete src + src rating
    rsrc = await db.execute(select(DriverRating).where(DriverRating.driver_id == src.id))
    rsrc_row = rsrc.scalar_one_or_none()
    if rsrc_row is not None:
        await db.delete(rsrc_row)
    await db.delete(src)
    await db.commit()
    return {"ok": True, "into": dst.id, "from": from_id}
