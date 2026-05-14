"""Apex log → session results extractor.

Reads one `data/recordings/<Circuit>/<YYYY-MM-DD>.log[.gz]` and yields
one record per (session, driver) with their lap-time statistics ready
for Glicko-2 ingestion.

Log format (validated against 1080 historical files in Phase 0):
  - Blocks separated by blank lines.
  - Each block starts with a "YYYY-MM-DD HH:MM:SS" timestamp line.
  - Inside the block, events of the form `key|class|value`:
        title1||<text>        — session segment 1 (event name)
        title2||<text>        — session segment 2 (heat / final / etc)
        r<N>c4|drteam|<NAME>  — driver assigned to row N (kart slot)
        r<N>c3 in grid HTML   — actual kart NUMBER for row N (parsed via regex)
        r<N>|*|<ms>|          — kart N just completed a lap of <ms>
        r<N>c5|<class>|<text> — Apex-formatted lap time string (we ignore this in favor of *)

A session is the period between title1+title2 changes. The kart→driver
map carries over within a session because drivers change via c4 events
during relays — we always attribute a lap to whoever was in that kart
at the moment of the * event.

Output is `SessionExtract` dicts ready to insert into `session_results`
once the `Driver` row exists in the DB.
"""
from __future__ import annotations

import gzip
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

from .normalizer import normalize_name

TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")
TITLE1_RE = re.compile(r"^title1\|\|(.*)$")
TITLE2_RE = re.compile(r"^title2\|\|(.*)$")
DRIVER_RE = re.compile(r"^(r\d+)c4\|drteam\|(.+?)(?:\s*\[\d+:\d+\])?$")
TEAM_RE = re.compile(r"^(r\d+)c4\|<team>\|(.+?)$")     # some grids use <team>
LAP_STAR_RE = re.compile(r"^(r\d+)\|\*\|(\d+)\|")
# The grid line is one big HTML payload that maps row → kart number.
KART_NUM_RE = re.compile(r'data-id="(r\d+)c3"[^>]*>(\d+)</')

# Minimum / maximum plausible kart-lap times. Anything outside is parser
# garbage (Apex sometimes flashes lap NUMBER in the same column) or
# a pit-through lap that shouldn't drive the rating math.
MIN_LAP_MS = 15_000
MAX_LAP_MS = 600_000   # 10 min — generous for slow tracks + back-of-pack


@dataclass
class DriverRunStats:
    """Running stats for ONE driver within ONE session — built up while
    we walk the log, then finalised into a SessionDriverResult."""
    raw_names_seen: set[str] = field(default_factory=set)
    karts_seen: set[int] = field(default_factory=set)
    teams_seen: set[str] = field(default_factory=set)
    lap_times_ms: list[int] = field(default_factory=list)


@dataclass
class SessionDriverResult:
    """Per-driver extract for one session, ready to be persisted as a
    `session_results` row once the driver_id is known."""
    circuit_name: str
    log_date: str
    title1: str
    title2: str
    raw_canonical: str            # normalized key (normalize_name output)
    raw_name_sample: str          # one of the raw variants, for display
    kart_number: int | None
    team_name: str
    total_laps: int
    best_lap_ms: int
    avg_lap_ms: float
    median_lap_ms: int


def _open(path: Path):
    if str(path).endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "rt", encoding="utf-8", errors="replace")


def _kart_for_row(grid_html: str) -> dict[str, int]:
    """Parse a `grid||<html>` payload into row→kart_number map."""
    out: dict[str, int] = {}
    for row_id, kart_str in KART_NUM_RE.findall(grid_html):
        try:
            out[row_id] = int(kart_str)
        except ValueError:
            continue
    return out


def _finalize_session(
    circuit_name: str,
    log_date: str,
    title1: str,
    title2: str,
    drivers: dict[str, DriverRunStats],
) -> list[SessionDriverResult]:
    """Compile DriverRunStats into one SessionDriverResult per driver."""
    out: list[SessionDriverResult] = []
    for canon, st in drivers.items():
        if not st.lap_times_ms:
            continue
        laps = sorted(st.lap_times_ms)
        best = laps[0]
        avg = sum(laps) / len(laps)
        median = laps[len(laps) // 2]
        # Pick the most-seen kart (drivers may switch karts mid-session
        # in rare formats; in normal endurance one kart is fine).
        kart_num = next(iter(st.karts_seen), None)
        team = next(iter(st.teams_seen), "")
        raw_sample = next(iter(st.raw_names_seen), canon)
        out.append(SessionDriverResult(
            circuit_name=circuit_name,
            log_date=log_date,
            title1=title1,
            title2=title2,
            raw_canonical=canon,
            raw_name_sample=raw_sample,
            kart_number=kart_num,
            team_name=team,
            total_laps=len(laps),
            best_lap_ms=best,
            avg_lap_ms=avg,
            median_lap_ms=median,
        ))
    return out


def parse_log(path: Path, circuit_name: str, log_date: str) -> Iterator[SessionDriverResult]:
    """Stream session-driver results from one Apex log file.

    `circuit_name` and `log_date` are derived from the file location by
    the caller (the log itself doesn't carry the circuit name).
    """
    current_title1 = ""
    current_title2 = ""
    in_session = False
    drivers: dict[str, DriverRunStats] = defaultdict(DriverRunStats)
    kart_to_driver: dict[str, str] = {}        # row_id → canonical name
    row_to_kart: dict[str, int] = {}           # row_id → physical kart_number
    row_to_team: dict[str, str] = {}           # row_id → team name from grid

    pending_results: list[SessionDriverResult] = []

    with _open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue

            # ── Session boundary detection ──
            m = TITLE1_RE.match(line)
            if m:
                new_t1 = m.group(1).strip()
                if new_t1 != current_title1:
                    # Title changing flushes the previous session.
                    if in_session:
                        pending_results.extend(_finalize_session(
                            circuit_name, log_date, current_title1, current_title2, drivers,
                        ))
                    current_title1 = new_t1
                    current_title2 = ""
                    drivers = defaultdict(DriverRunStats)
                    kart_to_driver = {}
                    in_session = bool(current_title1)
                continue
            m = TITLE2_RE.match(line)
            if m:
                new_t2 = m.group(1).strip()
                if new_t2 != current_title2:
                    if in_session and drivers:
                        # title2 also marks a session boundary when changed.
                        pending_results.extend(_finalize_session(
                            circuit_name, log_date, current_title1, current_title2, drivers,
                        ))
                        drivers = defaultdict(DriverRunStats)
                        kart_to_driver = {}
                    current_title2 = new_t2
                    in_session = bool(current_title1 or current_title2)
                continue

            # ── Grid event: gives us row → kart_number ──
            if line.startswith("grid||"):
                payload = line[len("grid||"):]
                row_to_kart.update(_kart_for_row(payload))
                continue

            # ── Driver attribution ──
            m = DRIVER_RE.match(line)
            if m and in_session:
                row_id = m.group(1)
                raw = m.group(2).strip()
                canon = normalize_name(raw)
                if canon:
                    kart_to_driver[row_id] = canon
                    drivers[canon].raw_names_seen.add(raw)
                    kart_num = row_to_kart.get(row_id)
                    if kart_num is not None:
                        drivers[canon].karts_seen.add(kart_num)
                    team = row_to_team.get(row_id, "")
                    if team:
                        drivers[canon].teams_seen.add(team)
                continue

            # ── Lap completion (the * star events) ──
            m = LAP_STAR_RE.match(line)
            if m and in_session:
                row_id = m.group(1)
                try:
                    lap_ms = int(m.group(2))
                except ValueError:
                    continue
                if lap_ms < MIN_LAP_MS or lap_ms > MAX_LAP_MS:
                    continue
                driver_canon = kart_to_driver.get(row_id)
                if not driver_canon:
                    continue
                stats = drivers[driver_canon]
                stats.lap_times_ms.append(lap_ms)
                kart_num = row_to_kart.get(row_id)
                if kart_num is not None:
                    stats.karts_seen.add(kart_num)
                continue

    # Flush the trailing session
    if in_session and drivers:
        pending_results.extend(_finalize_session(
            circuit_name, log_date, current_title1, current_title2, drivers,
        ))

    yield from pending_results
