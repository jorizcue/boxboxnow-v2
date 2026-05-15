"""Stage 1: raw Apex event stream → list[Segment].

A Segment is one Apex on-track grid period. Apex pushes an
``INIT value="init"`` (fresh grid, new contiguous row_ids) at the start
of every session — that, NOT the title, is the authoritative boundary.
We also defensively split on a title change without an accompanying
INIT-init and on a >20 min idle-with-laps gap. Pure: ``segment_events``
takes an iterable of ``(ts, [RaceEvent])``; ``segment_log`` wires the
live parser. ``app/apex/*`` is never mutated.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime

from app.apex.replay import parse_log_file
from app.apex.parser import ApexMessageParser, EventType, time_to_ms, RaceEvent

MIN_LAP_MS = 15_000
MAX_LAP_MS = 600_000
GAP_SPLIT_S = 20 * 60


def _coerce_lap_ms(raw) -> int | None:
    try:
        ms = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    return ms if MIN_LAP_MS <= ms <= MAX_LAP_MS else None


def _coerce_lap_str(raw) -> int | None:
    ms = time_to_ms(raw or "")
    return ms if MIN_LAP_MS <= ms <= MAX_LAP_MS else None


@dataclass
class _RowState:
    lap_ms: list[int] = field(default_factory=list)
    lap_from_str: list[int] = field(default_factory=list)
    drteam_names: list[str] = field(default_factory=list)
    last_live_name: str = ""
    apex_last_position: int | None = None
    retired: bool = False

    def note_name(self, name: str, *, is_drteam: bool) -> None:
        name = (name or "").strip()
        if not name:
            return
        self.last_live_name = name
        if is_drteam and (not self.drteam_names or self.drteam_names[-1] != name):
            self.drteam_names.append(name)

    def laps(self) -> list[int]:
        """Single lap source per row: LAP_MS buffer if any, else the
        LAP-string buffer. Never mixed (see extractor docstring history)."""
        return self.lap_ms if self.lap_ms else self.lap_from_str


@dataclass
class Segment:
    title1: str
    title2: str
    rows: dict[str, _RowState] = field(default_factory=dict)
    row_to_kart: dict[str, int] = field(default_factory=dict)
    init_team_name: dict[str, str] = field(default_factory=dict)
    first_lap_ts: datetime | None = None
    last_lap_ts: datetime | None = None
    had_chequered: bool = False

    def row(self, row_id: str) -> _RowState:
        st = self.rows.get(row_id)
        if st is None:
            st = _RowState()
            self.rows[row_id] = st
        return st

    @property
    def has_laps(self) -> bool:
        return any(r.lap_ms or r.lap_from_str for r in self.rows.values())

    @property
    def kart_set(self) -> set[int]:
        return set(self.row_to_kart.get(rid) for rid in self.rows
                   if self.row_to_kart.get(rid) is not None)


def segment_events(stream: Iterable[tuple[datetime, list[RaceEvent]]]) -> list[Segment]:
    """Pure core. `stream` is an iterable of `(ts, list[RaceEvent])`."""
    segments: list[Segment] = []
    cur: Segment | None = None
    cur_t1 = ""
    cur_t2 = ""

    for ts, events in stream:
        block_init_init = any(
            e.type == EventType.INIT and e.value == "init" for e in events
        )
        b1 = b2 = None
        for e in events:
            if e.type == EventType.CATEGORY and e.value:
                b1 = e.value
            elif e.type == EventType.SESSION_TITLE and e.value:
                b2 = e.value
        nt1 = b1 if b1 is not None else cur_t1
        nt2 = b2 if b2 is not None else cur_t2
        title_changed = (nt1 != cur_t1) or (nt2 != cur_t2)
        block_has_lap = any(
            e.type in (EventType.LAP_MS, EventType.LAP) for e in events
        )
        block_has_chequered = any(
            e.type == EventType.FLAG and e.value == "chequered" for e in events
        )

        # A chequered flag ends the race currently in `cur` — record it
        # on THAT segment before any split below moves us to a new one
        # (the assembler's stitch gate relies on had_chequered).
        if cur is not None and block_has_chequered and cur.has_laps:
            cur.had_chequered = True

        if cur is None:
            cur = Segment(nt1, nt2)
        elif block_init_init:
            segments.append(cur)
            cur = Segment(nt1, nt2)
        elif title_changed:
            segments.append(cur)
            cur = Segment(nt1, nt2)
        elif (
            cur.has_laps
            and cur.last_lap_ts is not None
            and not block_has_lap
            and (ts - cur.last_lap_ts).total_seconds() > GAP_SPLIT_S
        ):
            segments.append(cur)
            cur = Segment(nt1, nt2)

        cur_t1, cur_t2 = nt1, nt2

        for e in events:
            if e.type in (EventType.LAP_MS, EventType.LAP, EventType.DRIVER_TEAM,
                          EventType.TEAM, EventType.RANKING, EventType.STATUS) and not e.row_id:
                continue
            if e.type == EventType.INIT and e.row_id:
                tn = (e.extra or {}).get("team_name", "") if e.extra else ""
                if tn and e.row_id not in cur.init_team_name:
                    cur.init_team_name[e.row_id] = tn
            elif e.type == EventType.LAP_MS:
                ms = _coerce_lap_ms(e.value)
                if ms is not None:
                    cur.row(e.row_id).lap_ms.append(ms)
            elif e.type == EventType.LAP:
                ms = _coerce_lap_str(e.value)
                if ms is not None:
                    cur.row(e.row_id).lap_from_str.append(ms)
            elif e.type == EventType.DRIVER_TEAM:
                cur.row(e.row_id).note_name(e.value, is_drteam=True)
            elif e.type == EventType.TEAM:
                cur.row(e.row_id).note_name(e.value, is_drteam=False)
            elif e.type == EventType.RANKING:
                try:
                    cur.row(e.row_id).apex_last_position = int(e.value)
                except (TypeError, ValueError):
                    pass
            elif e.type == EventType.STATUS and e.value == "sr":
                cur.row(e.row_id).retired = True

        if block_has_lap:
            if cur.first_lap_ts is None:
                cur.first_lap_ts = ts
            cur.last_lap_ts = ts
            if block_has_chequered:
                cur.had_chequered = True

    if cur is not None:
        segments.append(cur)
    return [s for s in segments if s.has_laps]


def segment_log(filepath: str, *, circuit_name: str, log_date: str) -> list[Segment]:
    """Wire the live parser (read-only) and segment the recording.
    `row_to_kart` is snapshotted per segment at the end (it only grows
    on the shared parser, like the old extractor did at flush time)."""
    parser = ApexMessageParser()

    def _stream():
        for ts, message in parse_log_file(filepath):
            try:
                evs = parser.parse(message)
            except Exception:
                continue
            yield ts, evs

    segs = segment_events(_stream())
    snap = dict(parser.row_to_kart)
    for s in segs:
        s.row_to_kart = {rid: snap[rid] for rid in s.rows if rid in snap}
    return segs
