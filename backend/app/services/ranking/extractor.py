"""Raw Apex recording -> list[SessionExtract].

Drives the LIVE parser read-only (app/apex/replay + app/apex/parser).
Nothing here mutates app/apex/*. The parser contract is pinned by
tests/ranking/test_parser_contract.py.

Lap de-dup (the central correctness concern)
--------------------------------------------
Empirically (verified on both production fixtures, see
tests/ranking/test_parser_contract.py) BOTH circuits emit, per completed
lap, a pair of events:

  * ``EventType.LAP_MS``  — inline ``r<N>|*|<ms>|`` path, value = integer ms
  * ``EventType.LAP``     — column cell-update path, value = "M:SS.mmm"

They describe the SAME lap (e.g. RKC ``67626`` == ``1:07.626``). Summing
both double-counts every lap. Rule implemented here, per the empirical
finding: for each row keep two separate buffers; the row's laps are its
LAP_MS buffer if it produced *any* LAP_MS event, otherwise its LAP-string
buffer (parsed via ``time_to_ms``). The two are NEVER mixed for one row.

Driver attribution
------------------
Live ``DRIVER_TEAM``/``TEAM`` name events are the primary identity. But
kart-only recordings exist in the wild: the EUPEN fixture (kids'
categories) emits essentially NO live name events — only the INIT grid
carries a per-row ``team_name`` ("JULFRS", "ZIMBOMANN", ...). The old
regex parser required a live name and therefore produced ZERO sessions
for such logs — that is the bug under fix. So identity falls back:

    latest live DRIVER_TEAM/TEAM name
      -> INIT-grid team_name for the row
      -> "kart <n>" / "row:<id>"

A row is only skipped when it has NO identity at all AND no valid laps.

The driver-swap (endurance) signal is taken from the ``drteam`` channel
only: ``c4|drteam|<name>`` is Apex's post-relay driver string, so >1
distinct DRIVER_TEAM value on a row means a real relay. (TEAM/"dr" also
carries the constant team label alongside the driver in these logs, so
mixing it into swap detection would mark every row as a false swap.)
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field

from app.apex.replay import parse_log_file
from app.apex.parser import ApexMessageParser, EventType, time_to_ms

from .classifier import classify_session
from .normalizer import normalize_name

MIN_LAP_MS = 15_000
MAX_LAP_MS = 600_000
GAP_SPLIT_S = 20 * 60


@dataclass
class SessionExtract:
    circuit_name: str
    log_date: str
    title1: str
    title2: str
    session_seq: int
    session_type: str           # "race" | "pace"
    team_mode: str              # "endurance" | "individual"
    driver_canonical: str
    driver_raw: str
    kart_number: int | None
    team_key: str
    laps_ms: list[int] = field(default_factory=list)
    total_laps: int = 0
    best_lap_ms: int = 0
    avg_lap_ms: float = 0.0
    median_lap_ms: int = 0
    final_position: int | None = None
    duration_s: int = 0


@dataclass
class _RowState:
    """Mutable per-row accumulator within a single session window."""

    lap_ms: list[int] = field(default_factory=list)          # from LAP_MS events
    lap_from_str: list[int] = field(default_factory=list)    # from LAP cell-updates
    drteam_names: list[str] = field(default_factory=list)    # distinct, order-kept
    last_live_name: str = ""                                 # DRIVER_TEAM or TEAM
    last_position: int | None = None
    retired: bool = False

    def note_name(self, name: str, *, is_drteam: bool) -> None:
        name = (name or "").strip()
        if not name:
            return
        self.last_live_name = name
        if is_drteam and (not self.drteam_names or self.drteam_names[-1] != name):
            self.drteam_names.append(name)


class _SessionAccumulator:
    """One in-progress session: per-row state + title + timing window."""

    def __init__(self, title1: str, title2: str) -> None:
        self.title1 = title1
        self.title2 = title2
        self.rows: dict[str, _RowState] = {}
        self.first_lap_ts = None
        self.last_lap_ts = None

    def row(self, row_id: str) -> _RowState:
        st = self.rows.get(row_id)
        if st is None:
            st = _RowState()
            self.rows[row_id] = st
        return st

    @property
    def has_laps(self) -> bool:
        return any(r.lap_ms or r.lap_from_str for r in self.rows.values())

    def note_lap_ts(self, ts) -> None:
        if self.first_lap_ts is None:
            self.first_lap_ts = ts
        self.last_lap_ts = ts


def _coerce_lap_ms(raw: str) -> int | None:
    """LAP_MS value -> ms int, defensively (the value is normally a digit
    string but never trust the wire). Returns None if unusable / out of
    the plausible kart-lap window."""
    try:
        ms = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if MIN_LAP_MS <= ms <= MAX_LAP_MS:
        return ms
    return None


def _coerce_lap_str(raw: str) -> int | None:
    """LAP cell-update value ("M:SS.mmm"/"SS.mmm") -> ms int. ``time_to_ms``
    already returns 0 for empty/garbage; we then range-filter."""
    ms = time_to_ms(raw or "")
    if MIN_LAP_MS <= ms <= MAX_LAP_MS:
        return ms
    return None


def _finalize_session(
    acc: _SessionAccumulator,
    *,
    circuit_name: str,
    log_date: str,
    session_seq: int,
    row_to_kart: dict[str, int],
    init_team_name: dict[str, str],
) -> list[SessionExtract]:
    """Turn one accumulated session into >=0 SessionExtract rows (one per
    ratable driver row). Pure given its inputs."""
    duration_s = 0
    if acc.first_lap_ts is not None and acc.last_lap_ts is not None:
        duration_s = int((acc.last_lap_ts - acc.first_lap_ts).total_seconds())
        if duration_s < 0:
            duration_s = 0

    # Endurance signal: any row whose drteam driver string changed mid-session.
    had_swap = any(len(r.drteam_names) > 1 for r in acc.rows.values())

    cls = classify_session(
        acc.title1, acc.title2, duration_s=duration_s, had_driver_swap=had_swap
    )

    out: list[SessionExtract] = []
    for row_id, st in acc.rows.items():
        # Single lap source per row: LAP_MS if the row produced ANY, else
        # fall back to the LAP-string buffer. Never mix the two.
        laps = st.lap_ms if st.lap_ms else st.lap_from_str
        if not laps:
            continue

        kart_number = row_to_kart.get(row_id)

        # Identity priority: live name -> INIT grid team_name -> kart/row.
        raw_name = st.last_live_name or init_team_name.get(row_id, "")
        canonical = normalize_name(raw_name)
        if not canonical:
            if kart_number is not None:
                raw_name = f"KART {kart_number}"
            else:
                raw_name = f"ROW {row_id}"
            canonical = normalize_name(raw_name)
        if not canonical:
            # Truly unidentifiable (no name, no kart, no row id) — skip.
            continue

        team_key = str(kart_number) if kart_number is not None else f"row:{row_id}"

        best = min(laps)
        avg = statistics.fmean(laps)
        median = int(statistics.median(laps))

        out.append(
            SessionExtract(
                circuit_name=circuit_name,
                log_date=log_date,
                title1=acc.title1,
                title2=acc.title2,
                session_seq=session_seq,
                session_type=cls.session_type,
                team_mode=cls.team_mode,
                driver_canonical=canonical,
                driver_raw=raw_name,
                kart_number=kart_number,
                team_key=team_key,
                laps_ms=list(laps),
                total_laps=len(laps),
                best_lap_ms=best,
                avg_lap_ms=avg,
                median_lap_ms=median,
                final_position=st.last_position,
                duration_s=duration_s,
            )
        )
    return out


def extract_sessions(
    filepath: str, *, circuit_name: str, log_date: str
) -> list[SessionExtract]:
    """Replay an Apex recording through the live parser and return one
    ``SessionExtract`` per (session, ratable driver row).

    Never raises on malformed wire data — bad lines are skipped. The
    parser instance is persistent across the whole file so it accumulates
    the init grid / column map / row_to_kart exactly as production does.
    """
    parser = ApexMessageParser()

    # INIT-grid team names, captured the first time each row appears in a
    # grid. Used only as a name fallback for kart-only recordings.
    init_team_name: dict[str, str] = {}

    sessions: list[SessionExtract] = []
    session_seq = 0  # incremented to 1.. for each EMITTED session group

    cur: _SessionAccumulator | None = None
    cur_title1 = ""
    cur_title2 = ""

    def flush(acc: _SessionAccumulator | None) -> None:
        nonlocal session_seq
        if acc is None:
            return
        # Snapshot row_to_kart at finalize time (it only grows).
        emitted = _finalize_session(
            acc,
            circuit_name=circuit_name,
            log_date=log_date,
            session_seq=session_seq + 1,
            row_to_kart=dict(parser.row_to_kart),
            init_team_name=init_team_name,
        )
        if emitted:
            session_seq += 1
            sessions.extend(emitted)

    for ts, message in parse_log_file(filepath):
        try:
            events = parser.parse(message)
        except Exception:
            # Defensive: a single corrupt block must not abort extraction.
            continue

        # Capture INIT grid team names (read-only use of parser side effect).
        for ev in events:
            if ev.type == EventType.INIT and ev.row_id:
                tn = (ev.extra or {}).get("team_name", "")
                if tn and ev.row_id not in init_team_name:
                    init_team_name[ev.row_id] = tn

        # Title for this block (latest CATEGORY / SESSION_TITLE wins).
        block_title1 = None
        block_title2 = None
        for ev in events:
            if ev.type == EventType.CATEGORY and ev.value:
                block_title1 = ev.value
            elif ev.type == EventType.SESSION_TITLE and ev.value:
                block_title2 = ev.value

        new_title1 = block_title1 if block_title1 is not None else cur_title1
        new_title2 = block_title2 if block_title2 is not None else cur_title2
        title_changed = (new_title1 != cur_title1) or (new_title2 != cur_title2)

        block_has_lap = any(
            ev.type in (EventType.LAP_MS, EventType.LAP) for ev in events
        )

        # --- Session boundary detection ---------------------------------
        if cur is None:
            cur = _SessionAccumulator(new_title1, new_title2)
        elif title_changed:
            flush(cur)
            cur = _SessionAccumulator(new_title1, new_title2)
        elif (
            cur.has_laps
            and cur.last_lap_ts is not None
            and not block_has_lap
            and (ts - cur.last_lap_ts).total_seconds() > GAP_SPLIT_S
        ):
            # Long idle gap with no lap activity while a session already
            # has laps -> previous race ended, start a fresh window.
            flush(cur)
            cur = _SessionAccumulator(new_title1, new_title2)

        cur_title1 = new_title1
        cur_title2 = new_title2

        # --- Per-event accumulation -------------------------------------
        for ev in events:
            if ev.type == EventType.LAP_MS:
                ms = _coerce_lap_ms(ev.value)
                if ms is not None:
                    cur.row(ev.row_id).lap_ms.append(ms)
            elif ev.type == EventType.LAP:
                ms = _coerce_lap_str(ev.value)
                if ms is not None:
                    cur.row(ev.row_id).lap_from_str.append(ms)
            elif ev.type == EventType.DRIVER_TEAM:
                cur.row(ev.row_id).note_name(ev.value, is_drteam=True)
            elif ev.type == EventType.TEAM:
                cur.row(ev.row_id).note_name(ev.value, is_drteam=False)
            elif ev.type == EventType.RANKING:
                try:
                    cur.row(ev.row_id).last_position = int(ev.value)
                except (TypeError, ValueError):
                    pass
            elif ev.type == EventType.STATUS and ev.value == "sr":
                cur.row(ev.row_id).retired = True

        if block_has_lap:
            cur.note_lap_ts(ts)

    flush(cur)
    return sessions
