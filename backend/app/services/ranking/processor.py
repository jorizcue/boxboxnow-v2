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

  * `get_top_drivers(db, limit=None, min_sessions=2)`  — `limit=None` returns ALL drivers (no cap).
      Ranking page query. Filters out drivers below `min_sessions` so
      the leaderboard isn't polluted by one-off entries with
      undefendable ratings.
"""
from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass as _dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete

from app.models.schemas import (
    Driver, DriverAlias, DriverRating, DriverCircuitRating,
    SessionResult, RatingHistory, ProcessedLog,
)
from .glicko2 import (
    Glicko2State, update, DEFAULT_RATING, DEFAULT_RD, DEFAULT_VOLATILITY,
)
from .extractor import extract_sessions, SessionExtract
from .normalizer import normalize_name, display_form

logger = logging.getLogger(__name__)

# Sessions with fewer than this many drivers don't get rating updates
# (the math is meaningless with < 2 competitors, and we want to skip
# "practice with one driver" sessions). Note: a SESSION is grouped by
# (circuit, log_date, session_seq); the extractor already emits one
# SessionExtract per (session, ratable driver row).
MIN_DRIVERS_PER_SESSION = 3

# Drivers with fewer than this many laps in a session are excluded
# from the rating update. Filters out drivers who only did an out/in
# lap (e.g. parade or DNS) and avoids tanking their rating because
# their "average" was a 3-minute pit-through.
MIN_LAPS_PER_DRIVER = 5


@_dataclass(frozen=True)
class RatedDriver:
    name: str
    team_key: str
    corrected_avg_ms: float
    team_position: int | None  # real finishing position (team or individual)


def _pace_pctile(field: list[RatedDriver]) -> dict[str, float]:
    order = sorted(field, key=lambda d: d.corrected_avg_ms)
    n = len(order)
    if n <= 1:
        return {d.name: 0.0 for d in order}
    return {d.name: i / (n - 1) for i, d in enumerate(order)}


def effective_scores(field: list[RatedDriver], *, w: float = 0.7) -> dict[str, float]:
    """Lower = better. Race ordering key (spec §6.A).
    effective = w*norm_team_pos + (1-w)*pace_pctile, both in [0,1].
    n_teams == 1 → pure pace."""
    pace = _pace_pctile(field)
    pos_by_team: dict[str, int] = {}
    for d in field:
        if d.team_position is not None:
            existing = pos_by_team.setdefault(d.team_key, d.team_position)
            if existing != d.team_position:
                raise ValueError(
                    f"team_key {d.team_key!r}: conflicting team_position "
                    f"{existing} vs {d.team_position} (driver {d.name!r})"
                )
    n_teams = len(pos_by_team)
    if n_teams <= 1:
        return dict(pace)
    ranked_teams = sorted(pos_by_team, key=pos_by_team.__getitem__)
    norm_team = {tk: i / (n_teams - 1) for i, tk in enumerate(ranked_teams)}
    out: dict[str, float] = {}
    for d in field:
        if d.team_position is None or d.team_key not in norm_team:
            out[d.name] = pace[d.name]
        else:
            out[d.name] = w * norm_team[d.team_key] + (1 - w) * pace[d.name]
    return out


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


async def apply_extracts(
    sessions: list[SessionExtract],
    db: AsyncSession,
) -> dict:
    """Apply a list of ``SessionExtract`` (the extractor's output) to the
    DB: idempotent ``SessionResult`` upserts + Glicko-2 dual-track
    (global + per-circuit) rating updates.

    Sessions are grouped by ``(circuit, log_date, session_seq)`` and the
    groups are processed in sorted order so a single log's sessions are
    applied oldest-seq → newest. The pairwise Glicko outcomes are derived
    from a per-session ordering ``key`` (lower = better) that is the
    spec's race/pace methodology:

      * race (positions present)  → ``effective_scores`` (team pos blended
        with kart-bias-corrected pace, w=0.7)
      * pace (quali / practice / race-without-positions fallback) →
        rank by kart-bias-corrected average lap ascending

    The dual-track Glicko block below is the previous per-session code,
    unchanged in structure (same pre-state load, ``update()`` call,
    ``RatingHistory`` audit, per-circuit lazy row). The ONLY behavioural
    change is the pairwise score: it now reads the ordering ``key``
    instead of comparing ``corrected_avg_ms`` directly. Keeping the
    per-circuit branch is the fix for the empty ``driver_circuit_ratings``
    table in prod.
    """
    by_group: dict[tuple[str, str, int], list[SessionExtract]] = {}
    for s in sessions:
        by_group.setdefault((s.circuit_name, s.log_date, s.session_seq), []).append(s)

    applied = 0
    for (circuit_name, log_date, session_seq), group in sorted(by_group.items()):
        # ── Aggregate same-canonical rows within the group (spec §6: one
        # Glicko update per (driver, session); endurance pace = the
        # driver's pace across ALL their stints). Two SessionExtract rows
        # in the same group can resolve to the SAME canonical identity
        # (one driver doing multiple stints on different rows/karts in an
        # endurance race, or two raw labels that normalize identically).
        # Without this pre-pass the name-keyed dicts below would be
        # last-write-wins and silently drop the earlier stint from both
        # SessionResult and the Glicko field. We merge by canon BEFORE
        # the lap-floor / MIN_DRIVERS filters so the floor applies to the
        # driver's combined laps, not to a single short stint.
        def _identity(s: SessionExtract) -> tuple[str, str]:
            # Person identity for endurance: the row's driver is the
            # PERSON, not the team label — use the last distinct drteam
            # name when the extractor saw a live drteam channel for that
            # row, else the extractor's canonical (kart-only logs / no
            # live name).
            if s.drteam_names:
                person = s.drteam_names[-1]
                return normalize_name(person) or s.driver_canonical, person
            return s.driver_canonical, (s.driver_raw or "")

        rows_by_canon: dict[str, list[SessionExtract]] = {}
        for s in group:
            canon, _raw = _identity(s)
            rows_by_canon.setdefault(canon, []).append(s)

        agg_group: list[SessionExtract] = []
        for canon, rows in rows_by_canon.items():
            if len(rows) == 1:
                agg_group.append(rows[0])
                continue
            # Representative row for kart/team/position/titles: the one
            # with the most laps. In real endurance a driver stays on one
            # team/kart so these agree across stints; representative-by-
            # laps is a safe tiebreak for the rare cross-row case.
            rep = max(rows, key=lambda r: r.total_laps)
            combined_laps: list[int] = []
            for r in rows:
                combined_laps.extend(r.laps_ms)
            if combined_laps:
                # Recompute from combined laps with the SAME semantics the
                # extractor uses (best=min, avg=fmean, median=int(median)).
                total_laps = len(combined_laps)
                best_lap_ms = min(combined_laps)
                avg_lap_ms = statistics.fmean(combined_laps)
                median_lap_ms = int(statistics.median(combined_laps))
            else:
                # Defensive: rows with no per-lap list — fall back to a
                # lap-count-weighted mean / summed totals.
                total_laps = sum(r.total_laps for r in rows)
                best_lap_ms = min(r.best_lap_ms for r in rows if r.best_lap_ms) or rep.best_lap_ms
                if total_laps > 0:
                    avg_lap_ms = (
                        sum(r.avg_lap_ms * r.total_laps for r in rows) / total_laps
                    )
                else:
                    avg_lap_ms = rep.avg_lap_ms
                median_lap_ms = rep.median_lap_ms
            logger.info(
                "ranking: merged %d stint-rows for driver %s in %s/%s/seq%s",
                len(rows), canon, circuit_name, log_date, session_seq,
            )
            agg_group.append(SessionExtract(
                circuit_name=rep.circuit_name,
                log_date=rep.log_date,
                title1=rep.title1,
                title2=rep.title2,
                session_seq=rep.session_seq,
                session_type=rep.session_type,
                team_mode=rep.team_mode,
                driver_canonical=rep.driver_canonical,
                driver_raw=rep.driver_raw,
                kart_number=rep.kart_number,
                team_key=rep.team_key,
                drteam_names=list(rep.drteam_names),
                laps_ms=combined_laps,
                total_laps=total_laps,
                best_lap_ms=best_lap_ms,
                avg_lap_ms=avg_lap_ms,
                median_lap_ms=median_lap_ms,
                final_position=rep.final_position,
                duration_s=rep.duration_s,
            ))

        # Short heats legitimately have very few laps; lower the floor for
        # sprint/individual sessions (spec §4 validity filters). Applied to
        # the AGGREGATED drivers (combined laps), not raw stint rows.
        laps_floor = 3 if agg_group[0].team_mode == "individual" else MIN_LAPS_PER_DRIVER
        rated_se = [s for s in agg_group if s.total_laps >= laps_floor]
        if len(rated_se) < MIN_DRIVERS_PER_SESSION:
            continue

        # ── Kart bias correction ──
        # Mechanical kart differences (setup, wear) skew the avg lap by up
        # to ±1 s. Per `team_key` mean across drivers that ran it, minus
        # the field mean, subtracted from each driver's avg → kart-
        # corrected pace. Single-pass approximation (same as before).
        by_team: dict[str, list[float]] = {}
        for s in rated_se:
            by_team.setdefault(s.team_key, []).append(s.avg_lap_ms)
        team_mean = {k: statistics.mean(v) for k, v in by_team.items()}
        field_mean = statistics.mean(s.avg_lap_ms for s in rated_se)
        bias = {k: m - field_mean for k, m in team_mean.items()}

        is_race = (
            agg_group[0].session_type == "race"
            and any(s.final_position is not None for s in rated_se)
        )

        # ── Ordering key (lower = better) ──
        # rated_se is now the aggregated-per-driver list, so each canon
        # appears exactly once and the name-keyed dicts below are
        # collision-free.
        corrected_by_key: dict[str, float] = {}
        canon_of: dict[str, SessionExtract] = {}
        field: list[RatedDriver] = []
        for s in rated_se:
            canon, _raw = _identity(s)
            corrected = s.avg_lap_ms - bias.get(s.team_key, 0.0)
            corrected_by_key[canon] = corrected
            canon_of[canon] = s
            field.append(RatedDriver(
                name=canon,
                team_key=s.team_key,
                corrected_avg_ms=corrected,
                team_position=s.final_position if is_race else None,
            ))

        if is_race:
            try:
                key = effective_scores(field, w=0.7)
            except ValueError:
                # Dirty upstream data: same team_key with conflicting
                # team_position. Don't abort the whole run — fall back to
                # the pure pace path for this one group.
                logger.warning(
                    "ranking.apply_extracts: team_position conflict in "
                    "%s/%s/seq%s — falling back to pace ordering",
                    circuit_name, log_date, session_seq,
                )
                is_race = False
                order = sorted(field, key=lambda d: d.corrected_avg_ms)
                n = len(order)
                key = {d.name: (0.0 if n == 1 else i / (n - 1))
                       for i, d in enumerate(order)}
        else:
            order = sorted(field, key=lambda d: d.corrected_avg_ms)
            n = len(order)
            key = {d.name: (0.0 if n == 1 else i / (n - 1))
                   for i, d in enumerate(order)}

        # Resolve or create drivers and persist SessionResult rows. The
        # SessionResult-exists check (new unique key: circuit, date,
        # session_seq, driver) gates idempotent re-runs.
        driver_objs: list[tuple[SessionExtract, Driver, SessionResult, str]] = []
        for canon in key:
            s = canon_of[canon]
            _c, raw_sample = _identity(s)
            driver = await _resolve_or_create_driver(canon, raw_sample, db)
            team_key = s.team_key
            b = bias.get(team_key, 0.0)
            corrected = corrected_by_key[canon]

            res = await db.execute(
                select(SessionResult).where(
                    SessionResult.circuit_name == circuit_name,
                    SessionResult.log_date == log_date,
                    SessionResult.session_seq == session_seq,
                    SessionResult.driver_id == driver.id,
                )
            )
            existing = res.scalar_one_or_none()
            if existing is not None:
                continue  # idempotent: already processed
            sr = SessionResult(
                circuit_name=circuit_name,
                log_date=log_date,
                title1=s.title1,
                title2=s.title2,
                session_seq=session_seq,
                driver_id=driver.id,
                kart_number=s.kart_number,
                team_name=s.driver_raw or "",
                total_laps=s.total_laps,
                best_lap_ms=s.best_lap_ms,
                avg_lap_ms=s.avg_lap_ms,
                median_lap_ms=s.median_lap_ms,
                kart_bias_ms=b,
                corrected_avg_ms=corrected,
                final_position=(s.final_position if is_race else None),
                session_type=group[0].session_type,
                team_mode=group[0].team_mode,
                effective_score=key[canon],
                duration_s=group[0].duration_s,
            )
            db.add(sr)
            await db.flush()
            driver_objs.append((s, driver, sr, canon))

        if len(driver_objs) < MIN_DRIVERS_PER_SESSION:
            continue

        # ── Glicko-2 rating update ──
        # Load current pre-states for BOTH the global and the per-circuit
        # tracks. Both rating systems use the SAME pairwise outcomes
        # (derived from `key`), but each track has its own pre-state
        # — that's what lets a driver have e.g. global 1700 / Ariza 1900.
        pre_global: dict[int, Glicko2State] = {}
        pre_circuit: dict[int, Glicko2State] = {}
        circuit_rows: dict[int, DriverCircuitRating] = {}

        for _, driver, _, _ in driver_objs:
            # Global rating row is created with the Driver itself (in
            # `_resolve_or_create_driver`), so it's always present.
            gres = await db.execute(select(DriverRating).where(DriverRating.driver_id == driver.id))
            grow = gres.scalar_one()
            pre_global[driver.id] = Glicko2State(rating=grow.rating, rd=grow.rd, volatility=grow.volatility)

            # Per-circuit row is lazy — created on first appearance of this
            # driver at this circuit. THIS is what populates
            # driver_circuit_ratings (empty in prod before this rework).
            cres = await db.execute(
                select(DriverCircuitRating).where(
                    DriverCircuitRating.driver_id == driver.id,
                    DriverCircuitRating.circuit_name == circuit_name,
                )
            )
            crow = cres.scalar_one_or_none()
            if crow is None:
                crow = DriverCircuitRating(
                    driver_id=driver.id,
                    circuit_name=circuit_name,
                    rating=DEFAULT_RATING,
                    rd=DEFAULT_RD,
                    volatility=DEFAULT_VOLATILITY,
                )
                db.add(crow)
                await db.flush()
            circuit_rows[driver.id] = crow
            pre_circuit[driver.id] = Glicko2State(rating=crow.rating, rd=crow.rd, volatility=crow.volatility)

        # Build pairwise outcomes — same data feeds both updates. The
        # pairwise score is derived from the ordering `key` (the ONLY
        # change vs the old corrected_avg_ms comparison).
        log_date_obj: datetime | None = None
        try:
            log_date_obj = datetime.strptime(log_date, "%Y-%m-%d")
        except ValueError:
            log_date_obj = None

        for i, (se_i, drv_i, sr_i, canon_i) in enumerate(driver_objs):
            global_opps: list[tuple[Glicko2State, float]] = []
            circuit_opps: list[tuple[Glicko2State, float]] = []
            for j, (se_j, drv_j, sr_j, canon_j) in enumerate(driver_objs):
                if i == j:
                    continue
                ki = key[canon_i]
                kj = key[canon_j]
                if abs(ki - kj) < 1e-9:
                    score = 0.5
                elif ki < kj:
                    score = 1.0
                else:
                    score = 0.0
                global_opps.append((pre_global[drv_j.id], score))
                circuit_opps.append((pre_circuit[drv_j.id], score))

            # ── Global update ──
            new_global = update(pre_global[drv_i.id], global_opps)
            gres = await db.execute(select(DriverRating).where(DriverRating.driver_id == drv_i.id))
            grow = gres.scalar_one()
            prev_global_rating = grow.rating
            prev_global_rd = grow.rd
            grow.rating = new_global.rating
            grow.rd = new_global.rd
            grow.volatility = new_global.volatility
            grow.sessions_count = (grow.sessions_count or 0) + 1
            if log_date_obj is not None:
                grow.last_session_at = log_date_obj
            grow.updated_at = datetime.now(timezone.utc)

            # Audit row for the GLOBAL rating change. Per-circuit history
            # can be reconstructed by joining `rating_history` with
            # `session_results.circuit_name` — we keep the audit table
            # single-track so the schema stays clean.
            db.add(RatingHistory(
                driver_id=drv_i.id,
                session_result_id=sr_i.id,
                rating_before=prev_global_rating,
                rd_before=prev_global_rd,
                rating_after=new_global.rating,
                rd_after=new_global.rd,
                delta=new_global.rating - prev_global_rating,
            ))

            # ── Per-circuit update ──
            new_circuit = update(pre_circuit[drv_i.id], circuit_opps)
            crow = circuit_rows[drv_i.id]
            crow.rating = new_circuit.rating
            crow.rd = new_circuit.rd
            crow.volatility = new_circuit.volatility
            crow.sessions_count = (crow.sessions_count or 0) + 1
            if log_date_obj is not None:
                crow.last_session_at = log_date_obj
            crow.updated_at = datetime.now(timezone.utc)

            drv_i.sessions_count = (drv_i.sessions_count or 0) + 1
            drv_i.total_laps = (drv_i.total_laps or 0) + se_i.total_laps
            drv_i.updated_at = datetime.now(timezone.utc)

        applied += 1

    return {"sessions": applied}


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

    # Extract ratable sessions (drives the live Apex parser read-only,
    # handles every circuit's schema) then apply the Glicko-2 methodology.
    sessions = extract_sessions(str(path), circuit_name=circuit_name, log_date=log_date)
    # No per-group catch here: apply_extracts handles dirty groups internally; any raise → whole-log rollback+retry in process_pending.
    res = await apply_extracts(sessions, db)
    laps_count = sum(s.total_laps for s in sessions)
    sessions_count = res["sessions"]

    db.add(ProcessedLog(
        circuit_name=circuit_name,
        log_date=log_date,
        sessions_count=sessions_count,
        laps_count=laps_count,
    ))
    await db.commit()
    return {"skipped": False, "sessions": sessions_count, "laps": laps_count}


def _ordered_candidates(candidates: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    """Global chronological order: oldest log_date first, deduped,
    circuit name as deterministic tiebreak. Required so the global
    Glicko rating evolves in true time order across circuits (spec §8)."""
    return sorted(set(candidates), key=lambda cd: (cd[1], cd[0]))


async def process_pending(db: AsyncSession, recordings_dir: Path) -> dict:
    """Scan `recordings_dir/<Circuit>/<YYYY-MM-DD>.log[.gz]` and process
    every file not yet in `processed_logs`. Done in date order so the
    rating history is built chronologically."""
    if not recordings_dir.is_dir():
        return {"processed": 0, "skipped": 0, "error": "no_recordings_dir"}

    res = await db.execute(select(ProcessedLog.circuit_name, ProcessedLog.log_date))
    done = {(r[0], r[1]) for r in res.all()}

    path_by_key: dict[tuple[str, str], Path] = {}
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
            path_by_key[(circuit_dir.name, log_date)] = log_path

    processed = 0
    skipped = 0
    for circuit, log_date in _ordered_candidates(path_by_key.keys()):
        path = path_by_key[(circuit, log_date)]
        try:
            result = await process_log_file(path, circuit, log_date, db)
            if result.get("skipped"):
                skipped += 1
            else:
                processed += 1
        except Exception:
            logger.exception("ranking.process_log_file failed for %s/%s", circuit, log_date)
            await db.rollback()

    return {"processed": processed, "skipped": skipped, "total_candidates": len(path_by_key)}


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
    limit: int | None = None,
    min_sessions: int = 2,
    circuit: str | None = None,
) -> list[dict]:
    """Ranking page query. Sorted by rating descending.

    When `circuit` is None (or empty), returns the GLOBAL ranking.
    When `circuit` is a specific track name, returns the per-circuit
    ranking from `driver_circuit_ratings` — the same Glicko-2 math
    but only counting sessions at that track."""
    if circuit:
        q = (
            select(Driver, DriverCircuitRating)
            .join(DriverCircuitRating, DriverCircuitRating.driver_id == Driver.id)
            .where(DriverCircuitRating.circuit_name == circuit)
            .where(DriverCircuitRating.sessions_count >= min_sessions)
            .order_by(DriverCircuitRating.rating.desc())
        )
        if limit is not None:
            q = q.limit(limit)
        res = await db.execute(q)
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
                "circuit_name": circuit,
            })
        return out

    q2 = (
        select(Driver, DriverRating)
        .join(DriverRating, DriverRating.driver_id == Driver.id)
        .where(DriverRating.sessions_count >= min_sessions)
        .order_by(DriverRating.rating.desc())
    )
    if limit is not None:
        q2 = q2.limit(limit)
    res = await db.execute(q2)
    out2: list[dict] = []
    for rank, (driver, rating) in enumerate(res.all(), start=1):
        out2.append({
            "rank": rank,
            "driver_id": driver.id,
            "canonical_name": driver.canonical_name,
            "rating": round(rating.rating, 1),
            "rd": round(rating.rd, 1),
            "volatility": round(rating.volatility, 4),
            "sessions_count": rating.sessions_count,
            "total_laps": driver.total_laps,
            "last_session_at": rating.last_session_at.isoformat() if rating.last_session_at else None,
            "circuit_name": None,
        })
    return out2


async def list_circuits_with_ratings(db: AsyncSession) -> list[dict]:
    """List circuits that have any per-circuit ratings stored, with
    counts. Drives the circuit dropdown in the admin Ranking panel."""
    res = await db.execute(
        select(
            DriverCircuitRating.circuit_name,
            func.count(DriverCircuitRating.driver_id).label("drivers"),
            func.max(DriverCircuitRating.last_session_at).label("last"),
        )
        .group_by(DriverCircuitRating.circuit_name)
        .order_by(func.count(DriverCircuitRating.driver_id).desc())
    )
    out: list[dict] = []
    for row in res.all():
        out.append({
            "circuit_name": row[0],
            "drivers_count": row[1],
            "last_session_at": row[2].isoformat() if row[2] else None,
        })
    return out


async def get_driver_detail(driver_id: int, db: AsyncSession) -> dict | None:
    """Full per-driver detail: global rating, every per-circuit rating,
    aliases, last 50 rating-history entries, and recent session
    results. Drives the modal that opens when clicking a driver row in
    the admin Ranking leaderboard."""
    res = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = res.scalar_one_or_none()
    if driver is None:
        return None

    # Global rating
    gres = await db.execute(select(DriverRating).where(DriverRating.driver_id == driver_id))
    grow = gres.scalar_one_or_none()
    global_rating = {
        "rating": round(grow.rating, 1) if grow else DEFAULT_RATING,
        "rd": round(grow.rd, 1) if grow else DEFAULT_RD,
        "volatility": round(grow.volatility, 4) if grow else DEFAULT_VOLATILITY,
        "sessions_count": grow.sessions_count if grow else 0,
        "last_session_at": grow.last_session_at.isoformat() if grow and grow.last_session_at else None,
    }

    # All per-circuit ratings for this driver
    cres = await db.execute(
        select(DriverCircuitRating)
        .where(DriverCircuitRating.driver_id == driver_id)
        .order_by(DriverCircuitRating.rating.desc())
    )
    circuit_ratings = [
        {
            "circuit_name": c.circuit_name,
            "rating": round(c.rating, 1),
            "rd": round(c.rd, 1),
            "sessions_count": c.sessions_count,
            "last_session_at": c.last_session_at.isoformat() if c.last_session_at else None,
        }
        for c in cres.scalars().all()
    ]

    # Aliases
    ares = await db.execute(
        select(DriverAlias.alias).where(DriverAlias.driver_id == driver_id)
        .order_by(DriverAlias.alias)
    )
    aliases = [r[0] for r in ares.all()]

    # Rating history (joined with session results so we can show
    # circuit + date next to each delta). Limited to last 50.
    hres = await db.execute(
        select(RatingHistory, SessionResult)
        .join(SessionResult, SessionResult.id == RatingHistory.session_result_id)
        .where(RatingHistory.driver_id == driver_id)
        .order_by(RatingHistory.id.asc())
    )
    history_full = [
        {
            "circuit_name": sr.circuit_name,
            "log_date": sr.log_date,
            "title1": sr.title1,
            "title2": sr.title2,
            "rating_before": round(rh.rating_before, 1),
            "rating_after": round(rh.rating_after, 1),
            "rd_after": round(rh.rd_after, 1),
            "delta": round(rh.delta, 1),
        }
        for rh, sr in hres.all()
    ]
    # Keep all of it — the chart needs the whole sequence to be
    # meaningful, and there are at most a few hundred entries per
    # driver.

    # Recent session results (top 20 by date desc).
    sres = await db.execute(
        select(SessionResult)
        .where(SessionResult.driver_id == driver_id)
        .order_by(SessionResult.log_date.desc(), SessionResult.id.desc())
        .limit(20)
    )
    recent_sessions = [
        {
            "circuit_name": s.circuit_name,
            "log_date": s.log_date,
            "title1": s.title1,
            "title2": s.title2,
            "kart_number": s.kart_number,
            "team_name": s.team_name,
            "total_laps": s.total_laps,
            "best_lap_ms": s.best_lap_ms,
            "avg_lap_ms": round(s.avg_lap_ms, 0),
            "final_position": s.final_position,
            "session_type": s.session_type,
            "effective_score": round(s.effective_score, 4) if s.effective_score is not None else None,
        }
        for s in sres.scalars().all()
    ]

    return {
        "driver_id": driver.id,
        "canonical_name": driver.canonical_name,
        "normalized_key": driver.normalized_key,
        "sessions_count": driver.sessions_count,
        "total_laps": driver.total_laps,
        "global_rating": global_rating,
        "circuit_ratings": circuit_ratings,
        "aliases": aliases,
        "history": history_full,
        "recent_sessions": recent_sessions,
    }


async def reset_ratings(db: AsyncSession, wipe_drivers: bool = False) -> dict:
    """Re-rate from scratch. Truncates `rating_history`,
    `driver_circuit_ratings`, `driver_ratings`, `session_results` and
    `processed_logs`. Drivers + aliases are preserved by default so
    the admin's manual merges survive — pass `wipe_drivers=True` to
    nuke those too.

    After truncation the caller is expected to trigger the runner
    (`process_pending`) which will re-parse every recording and
    rebuild everything. We don't kick off the runner here; the route
    does it explicitly so the admin sees a confirmation in the
    response."""
    counts = {}
    counts["rating_history"] = (await db.execute(delete(RatingHistory))).rowcount
    counts["driver_circuit_ratings"] = (await db.execute(delete(DriverCircuitRating))).rowcount
    counts["driver_ratings"] = (await db.execute(delete(DriverRating))).rowcount
    counts["session_results"] = (await db.execute(delete(SessionResult))).rowcount
    counts["processed_logs"] = (await db.execute(delete(ProcessedLog))).rowcount
    if wipe_drivers:
        counts["driver_aliases"] = (await db.execute(delete(DriverAlias))).rowcount
        counts["drivers"] = (await db.execute(delete(Driver))).rowcount
    else:
        # Even if we keep drivers, their denormalised counters should
        # go back to zero — the next backfill will repopulate them.
        from sqlalchemy import update as sa_update
        await db.execute(sa_update(Driver).values(sessions_count=0, total_laps=0))
    await db.commit()
    return counts


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
