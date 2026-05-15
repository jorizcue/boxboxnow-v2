# Ranking Race-Classification Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ranking extractor's fragile title/gap session windowing with INIT-grid segmentation + endurance stitching, and compute `final_position` by reconstructing the real finishing order from lap data (team/kart-shared for endurance), so Glicko‑2 ELO reflects true race results.

**Architecture:** Decompose `extractor.py` into three pure stages — `segmenter.py` (cut the parsed event stream into segments on `INIT value="init"` / title / 20‑min gap), `assembler.py` (stitch consecutive segments of one ongoing race; otherwise one segment = one race), `results.py` (per race, classify competitors by `(retired, −laps, race_time, key)` with endurance competitor = kart, position shared by all the kart's drivers). `extractor.py` becomes a thin façade preserving `extract_sessions()` / `SessionExtract`. `processor.py` is unchanged except persisting a new diagnostic column.

**Tech Stack:** Python 3.11, SQLAlchemy async + SQLite, pytest. Backend at `backend/`, ranking package `backend/app/services/ranking/`, tests `backend/tests/ranking/`. Run tests from `backend/`: `cd backend && python -m pytest tests/ranking -q`.

---

## Reference: design doc

`docs/superpowers/specs/2026-05-16-ranking-race-classification-rework-design.md` (APPROVED). Read it once before starting.

## Current behaviour being replaced (so you understand the diff)

`backend/app/services/ranking/extractor.py` today: `extract_sessions(filepath, *, circuit_name, log_date)` replays the log through `ApexMessageParser`, accumulates one `_SessionAccumulator` and flushes a new session **only** on title change or a >20 min idle-with-laps gap. `_finalize_session` sets `final_position = last RANKING value seen` (classified) / behind for retired. `processor.apply_extracts` groups `SessionExtract` by `(circuit_name, log_date, session_seq)`, aggregates rows per canonical person, and rates races via `effective_scores` keyed by `team_key` (= `str(kart_number)`).

Public contract that MUST keep working unchanged: `from app.services.ranking.extractor import extract_sessions, SessionExtract` and the `SessionExtract` field set used by `processor.py` and `tests/ranking/`.

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/ranking/segmenter.py` (new) | `Segment` dataclass + `segment_events(stream)` (pure core) + `segment_log(filepath, *, circuit_name, log_date)` (wires `parse_log_file` + `ApexMessageParser`). Owns `_RowState`, lap-coerce helpers, INIT/title/gap boundary, `had_chequered`, `kart_set`, `init_team_name`. |
| `backend/app/services/ranking/assembler.py` (new) | `Race` dataclass + `assemble_races(segments)` (stitch rule + `classify_session` for type/mode on combined duration & swap). |
| `backend/app/services/ranking/results.py` (new) | `SessionExtract` dataclass (moved here) + `reconstruct_race(race, *, circuit_name, log_date, session_seq)` (identity, competitor unit, classification key, team sharing). |
| `backend/app/services/ranking/extractor.py` (rewrite → façade) | `from .results import SessionExtract`; `extract_sessions()` = `segment_log → assemble_races → reconstruct_race`, assigning 1-based `session_seq` per emitted race. Keeps `MIN_LAP_MS`/`MAX_LAP_MS` re-export if referenced. |
| `backend/app/models/schemas.py` (modify) | Add `apex_last_position` column to `SessionResult`. |
| `backend/app/models/database.py` (modify) | Idempotent `ALTER TABLE session_results ADD COLUMN apex_last_position`. |
| `backend/app/services/ranking/processor.py` (modify) | Persist `apex_last_position` into the `SessionResult(...)` upsert. No rating-logic change. |
| `backend/tests/ranking/test_segmenter.py` (new) | Unit tests for segmentation. |
| `backend/tests/ranking/test_assembler.py` (new) | Unit tests for stitch/split. |
| `backend/tests/ranking/test_results.py` (new) | Unit tests for classification + team sharing. |
| `backend/tests/ranking/test_race_classification_integration.py` (new) | End-to-end on trimmed prod fixtures (Ariza heats, Santos 12h). |
| `backend/tests/ranking/fixtures/ariza_heats_2026-05-02.log` (new) | Trimmed slice (HEAT B-C double-run + a superpole). |
| `backend/tests/ranking/fixtures/santos_12h_2026-04-25.log` (new) | Trimmed slice spanning the 12h reconnect. |

`app/apex/*` is NOT modified (pinned by `tests/ranking/test_parser_contract.py`).

---

### Task 1: DB column `apex_last_position`

**Files:**
- Modify: `backend/app/models/schemas.py` (class `SessionResult`)
- Modify: `backend/app/models/database.py` (migration block, after the `coming_soon` ALTER)

- [ ] **Step 1: Add the column to the model**

In `backend/app/models/schemas.py`, inside `class SessionResult`, locate the line:
```python
    duration_s = Column(Integer, default=0, nullable=False)
```
Add immediately after it:
```python
    # Raw last Apex RANKING value seen for the row — DIAGNOSTIC ONLY.
    # The rating uses `final_position` (reconstructed from lap data);
    # this is kept to audit how wrong Apex's live position was.
    apex_last_position = Column(Integer, nullable=True)
```

- [ ] **Step 2: Add the idempotent migration**

In `backend/app/models/database.py`, find:
```python
        try:
            await conn.execute(text("ALTER TABLE product_tab_config ADD COLUMN coming_soon BOOLEAN DEFAULT 0 NOT NULL"))
        except Exception:
            pass
```
Add immediately after that block:
```python
        # Diagnostic: raw Apex last position on session_results (rating
        # uses reconstructed final_position; this is audit-only).
        try:
            await conn.execute(text("ALTER TABLE session_results ADD COLUMN apex_last_position INTEGER"))
        except Exception:
            pass
```

- [ ] **Step 3: Compile-check**

Run: `cd backend && python -m py_compile app/models/schemas.py app/models/database.py`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/schemas.py backend/app/models/database.py
git commit -m "feat(ranking): add diagnostic apex_last_position column to session_results"
```

---

### Task 2: `segmenter.py` — segment the event stream

The segmenter consumes `(ts, [RaceEvent])` and cuts a new `Segment` on `INIT value=="init"`, on a title change with no INIT-init in the same block, or on a >20‑min idle-with-laps gap. It records laps (single source: LAP_MS buffer if any, else LAP-string buffer), names, drteam, retired, raw last Apex position, kart set, INIT-grid team names, and whether a chequered flag was seen after laps.

**Files:**
- Create: `backend/app/services/ranking/segmenter.py`
- Test: `backend/tests/ranking/test_segmenter.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ranking/test_segmenter.py`:
```python
from datetime import datetime, timedelta

from app.apex.parser import RaceEvent, EventType
from app.services.ranking.segmenter import segment_events


def _ts(s):  # seconds → datetime
    return datetime(2026, 5, 2, 10, 0, 0) + timedelta(seconds=s)


def ev(t, **kw):
    return RaceEvent(type=t, **kw)


def test_init_init_starts_new_segment_even_with_same_title():
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="HEAT B-C"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.INIT, value="kart", row_id="r1"),
                  ev(EventType.LAP_MS, row_id="r1", value="40000"),
                  ev(EventType.RANKING, row_id="r1", value="1")]),
        (_ts(60), [ev(EventType.FLAG, value="chequered")]),
        # Same title, but a fresh INIT-init → MUST be a new segment.
        (_ts(120), [ev(EventType.INIT, value="init"),
                    ev(EventType.INIT, value="kart", row_id="r9"),
                    ev(EventType.LAP_MS, row_id="r9", value="41000"),
                    ev(EventType.RANKING, row_id="r9", value="2")]),
    ]
    segs = segment_events(stream)
    assert len(segs) == 2
    assert segs[0].had_chequered is True
    assert "r1" in segs[0].rows and "r9" not in segs[0].rows
    assert "r9" in segs[1].rows and "r1" not in segs[1].rows


def test_lap_source_prefers_lap_ms_over_lap_string():
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="X"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.LAP_MS, row_id="r1", value="42000"),
                  ev(EventType.LAP, row_id="r1", value="0:42.000"),
                  ev(EventType.LAP, row_id="r1", value="0:43.000")]),
    ]
    segs = segment_events(stream)
    assert segs[0].rows["r1"].laps() == [42000]  # LAP_MS buffer wins, never mixed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/ranking/test_segmenter.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.ranking.segmenter'`.

- [ ] **Step 3: Implement `segmenter.py`**

Create `backend/app/services/ranking/segmenter.py`:
```python
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

from dataclasses import dataclass, field

from app.apex.replay import parse_log_file
from app.apex.parser import ApexMessageParser, EventType, time_to_ms

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
    first_lap_ts: object | None = None
    last_lap_ts: object | None = None
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


def segment_events(stream) -> list[Segment]:
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
            elif e.type == EventType.FLAG and e.value == "chequered":
                if cur.has_laps:
                    cur.had_chequered = True

        if block_has_lap:
            if cur.first_lap_ts is None:
                cur.first_lap_ts = ts
            cur.last_lap_ts = ts

    if cur is not None:
        segments.append(cur)
    return segments


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/ranking/test_segmenter.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ranking/segmenter.py backend/tests/ranking/test_segmenter.py
git commit -m "feat(ranking): segmenter — INIT-grid session boundaries"
```

---

### Task 3: `assembler.py` — stitch endurance reconnects

One segment = one race by default. Stitch the current segment onto the previous race only when ALL: same normalized title, previous race's last segment did NOT see a chequered flag, gap ≤ 300 s, kart-set Jaccard overlap ≥ 0.5. Title/type/mode resolved by `classify_session` on combined duration + any-swap across the race's segments.

**Files:**
- Create: `backend/app/services/ranking/assembler.py`
- Test: `backend/tests/ranking/test_assembler.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ranking/test_assembler.py`:
```python
from datetime import datetime, timedelta

from app.services.ranking.segmenter import Segment, _RowState
from app.services.ranking.assembler import assemble_races


def _seg(title2, *, karts, t0_s, t1_s, chequered, laps_per=10):
    s = Segment("", title2)
    for i, k in enumerate(karts):
        rid = f"r{title2}{k}"
        st = _RowState()
        st.lap_ms = [40000] * laps_per
        s.rows[rid] = st
        s.row_to_kart[rid] = k
    base = datetime(2026, 5, 2, 10, 0, 0)
    s.first_lap_ts = base + timedelta(seconds=t0_s)
    s.last_lap_ts = base + timedelta(seconds=t1_s)
    s.had_chequered = chequered
    return s


def test_two_same_title_heats_with_chequered_between_do_not_stitch():
    a = _seg("HEAT B-C", karts=[1, 2, 3], t0_s=0, t1_s=600, chequered=True)
    b = _seg("HEAT B-C", karts=[1, 2, 3], t0_s=700, t1_s=1300, chequered=True)
    races = assemble_races([a, b])
    assert len(races) == 2


def test_endurance_reconnect_same_title_no_chequered_stitches():
    a = _seg("12H", karts=[8, 9, 10], t0_s=0, t1_s=3600, chequered=False, laps_per=300)
    b = _seg("12H", karts=[8, 9, 10], t0_s=3700, t1_s=7200, chequered=False, laps_per=250)
    races = assemble_races([a, b])
    assert len(races) == 1
    assert len(races[0].segments) == 2


def test_disjoint_karts_do_not_stitch():
    a = _seg("HEAT", karts=[1, 2, 3], t0_s=0, t1_s=600, chequered=False)
    b = _seg("HEAT", karts=[7, 8, 9], t0_s=650, t1_s=1200, chequered=False)
    races = assemble_races([a, b])
    assert len(races) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/ranking/test_assembler.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.ranking.assembler'`.

- [ ] **Step 3: Implement `assembler.py`**

Create `backend/app/services/ranking/assembler.py`:
```python
"""Stage 2: list[Segment] → list[Race].

Default: one segment = one race (fixes Apex reusing a title across
consecutive heats / superpole — they are distinct grids). Stitch a
segment onto the previous race only when it is the SAME ongoing race
that Apex re-gridded mid-event (endurance reconnect): same title, no
chequered yet, short gap, same competitors. Ambiguity ⇒ do NOT stitch
(a clean split is less harmful than an over-merge).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .segmenter import Segment
from .classifier import classify_session

STITCH_GAP_S = 300
STITCH_KART_OVERLAP = 0.5


@dataclass
class Race:
    segments: list[Segment] = field(default_factory=list)

    @property
    def title1(self) -> str:
        return self.segments[0].title1 if self.segments else ""

    @property
    def title2(self) -> str:
        return self.segments[0].title2 if self.segments else ""

    @property
    def duration_s(self) -> int:
        ts = [s.first_lap_ts for s in self.segments if s.first_lap_ts is not None]
        te = [s.last_lap_ts for s in self.segments if s.last_lap_ts is not None]
        if not ts or not te:
            return 0
        d = int((max(te) - min(ts)).total_seconds())
        return d if d > 0 else 0

    @property
    def had_chequered(self) -> bool:
        return any(s.had_chequered for s in self.segments)

    @property
    def kart_set(self) -> set[int]:
        out: set[int] = set()
        for s in self.segments:
            out |= s.kart_set
        return out


def _norm(s: str) -> str:
    return (s or "").strip().upper()


def _overlap(a: set[int], b: set[int]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def assemble_races(segments: list[Segment]) -> list[Race]:
    races: list[Race] = []
    for seg in segments:
        if not races:
            races.append(Race([seg]))
            continue
        prev = races[-1]
        prev_last = prev.segments[-1]
        same_title = (_norm(prev.title1), _norm(prev.title2)) == (_norm(seg.title1), _norm(seg.title2))
        gap_ok = (
            prev_last.last_lap_ts is not None
            and seg.first_lap_ts is not None
            and (seg.first_lap_ts - prev_last.last_lap_ts).total_seconds() <= STITCH_GAP_S
        )
        karts_ok = _overlap(prev.kart_set, seg.kart_set) >= STITCH_KART_OVERLAP
        if same_title and not prev_last.had_chequered and gap_ok and karts_ok:
            prev.segments.append(seg)
        else:
            races.append(Race([seg]))
    return races


def classify_race(race: Race):
    """SessionClass for the assembled race (combined duration + any swap
    across its segments)."""
    had_swap = any(
        len(r.drteam_names) > 1
        for s in race.segments for r in s.rows.values()
    )
    return classify_session(
        race.title1, race.title2,
        duration_s=race.duration_s, had_driver_swap=had_swap,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/ranking/test_assembler.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ranking/assembler.py backend/tests/ranking/test_assembler.py
git commit -m "feat(ranking): assembler — stitch endurance reconnects, split distinct heats"
```

---

### Task 4: `results.py` — reconstruct finishing classification

Per race: competitor = kart (endurance) or driver-row (individual). Per competitor: `retired` (any row STATUS=sr), `laps` (sum), `race_time_ms` (sum of those laps). Sort `(retired, −laps, race_time_ms, key)`; assign `final_position` 1..N. Endurance: every driver of the kart gets the kart's position. Emit one `SessionExtract` per ratable driver row (identity chain: live name → INIT-grid team_name → KART n/ROW id).

**Files:**
- Create: `backend/app/services/ranking/results.py`
- Test: `backend/tests/ranking/test_results.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ranking/test_results.py`:
```python
from app.services.ranking.segmenter import Segment, _RowState
from app.services.ranking.assembler import Race
from app.services.ranking.results import reconstruct_race


def _row(name, laps_ms, *, drteam=None, retired=False):
    st = _RowState()
    st.lap_ms = list(laps_ms)
    st.last_live_name = name
    if drteam:
        st.drteam_names = list(drteam)
    st.retired = retired
    return st


def test_individual_sprint_classifies_by_laps_then_time():
    seg = Segment("", "HEAT A-B")
    # winner: same laps, lowest total time
    seg.rows["rA"] = _row("ALICE", [40000, 40000, 40000]); seg.row_to_kart["rA"] = 1
    seg.rows["rB"] = _row("BOB", [41000, 41000, 41000]); seg.row_to_kart["rB"] = 2
    seg.rows["rC"] = _row("CARL", [40000, 40000])        ; seg.row_to_kart["rC"] = 3  # 1 lap down
    race = Race([seg])
    out = {s.driver_raw: s for s in reconstruct_race(
        race, circuit_name="X", log_date="2026-05-02", session_seq=1)}
    assert out["ALICE"].final_position == 1
    assert out["BOB"].final_position == 2
    assert out["CARL"].final_position == 3   # fewer laps → behind
    assert out["ALICE"].session_type == "race"


def test_retired_sorts_strictly_behind_classified():
    seg = Segment("", "RACE")
    seg.rows["r1"] = _row("WINNER", [40000] * 5); seg.row_to_kart["r1"] = 1
    seg.rows["r2"] = _row("DNF", [39000] * 9, retired=True); seg.row_to_kart["r2"] = 2  # more laps but retired
    race = Race([seg])
    out = {s.driver_raw: s for s in reconstruct_race(
        race, circuit_name="X", log_date="d", session_seq=1)}
    assert out["WINNER"].final_position == 1
    assert out["DNF"].final_position == 2  # behind despite more laps


def test_endurance_team_position_shared_by_all_kart_drivers():
    seg = Segment("12 HORAS", "CARRERA")
    # kart 9: two drivers (swap) ~big laps; kart 8 fewer laps
    seg.rows["r9a"] = _row("TEAM9", [60000] * 300, drteam=["DRIVER A"]); seg.row_to_kart["r9a"] = 9
    seg.rows["r9b"] = _row("TEAM9", [60000] * 300, drteam=["DRIVER B"]); seg.row_to_kart["r9b"] = 9
    seg.rows["r8"]  = _row("TEAM8", [60000] * 700, drteam=["DRIVER C"]); seg.row_to_kart["r8"] = 8
    # force endurance: long duration via many laps already; swap present
    race = Race([seg])
    out = list(reconstruct_race(race, circuit_name="X", log_date="d", session_seq=1))
    by_kart = {}
    for s in out:
        by_kart.setdefault(s.kart_number, set()).add(s.final_position)
    # kart 8 has more laps → P1; kart 9 → P2; both drivers of kart 9 share P2
    assert by_kart[8] == {1}
    assert by_kart[9] == {2}
    assert len([s for s in out if s.kart_number == 9]) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/ranking/test_results.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.ranking.results'`.

- [ ] **Step 3: Implement `results.py`**

Create `backend/app/services/ranking/results.py`:
```python
"""Stage 3: Race → list[SessionExtract] with the finishing order
RECONSTRUCTED from lap data (Apex RANKING is not trusted for the
result). Competitor = kart for endurance, driver-row for individual.
Classification key: (retired, -laps, race_time_ms, stable). Endurance:
the kart's position is shared by every driver who drove it.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field

from .assembler import Race, classify_race
from .normalizer import normalize_name


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
    drteam_names: list[str] = field(default_factory=list)
    laps_ms: list[int] = field(default_factory=list)
    total_laps: int = 0
    best_lap_ms: int = 0
    avg_lap_ms: float = 0.0
    median_lap_ms: int = 0
    final_position: int | None = None
    apex_last_position: int | None = None
    duration_s: int = 0


@dataclass
class _Row:
    row_id: str
    kart_number: int | None
    raw_name: str
    canonical: str
    team_key: str
    laps: list[int]
    drteam_names: list[str]
    retired: bool
    apex_last_position: int | None


def _collect_rows(race: Race) -> list[_Row]:
    """One _Row per (row_id) aggregated across the race's segments."""
    acc: dict[str, dict] = {}
    for seg in race.segments:
        for rid, st in seg.rows.items():
            laps = st.laps()
            if not laps:
                continue
            kart = seg.row_to_kart.get(rid)
            raw_name = st.last_live_name or seg.init_team_name.get(rid, "")
            a = acc.setdefault(rid, {
                "kart": kart, "raw": raw_name, "laps": [],
                "drteam": [], "retired": False, "apex": None,
            })
            if kart is not None:
                a["kart"] = kart
            if raw_name and not a["raw"]:
                a["raw"] = raw_name
            a["laps"].extend(laps)
            for n in st.drteam_names:
                if not a["drteam"] or a["drteam"][-1] != n:
                    a["drteam"].append(n)
            a["retired"] = a["retired"] or st.retired
            if st.apex_last_position is not None:
                a["apex"] = st.apex_last_position
    rows: list[_Row] = []
    for rid, a in acc.items():
        raw_name = a["raw"]
        canonical = normalize_name(raw_name)
        if not canonical:
            raw_name = f"KART {a['kart']}" if a["kart"] is not None else f"ROW {rid}"
            canonical = normalize_name(raw_name)
        if not canonical:
            continue
        team_key = str(a["kart"]) if a["kart"] is not None else f"row:{rid}"
        rows.append(_Row(rid, a["kart"], raw_name, canonical, team_key,
                          a["laps"], a["drteam"], a["retired"], a["apex"]))
    return rows


def reconstruct_race(
    race: Race, *, circuit_name: str, log_date: str, session_seq: int
) -> list[SessionExtract]:
    cls = classify_race(race)
    rows = _collect_rows(race)
    if not rows:
        return []

    endurance = cls.team_mode == "endurance"

    # Competitor unit: kart for endurance (a "team"), the row otherwise.
    comp_of: dict[str, str] = {}
    comp_rows: dict[str, list[_Row]] = {}
    for r in rows:
        cid = (str(r.kart_number) if (endurance and r.kart_number is not None)
               else r.row_id)
        comp_of[r.row_id] = cid
        comp_rows.setdefault(cid, []).append(r)

    # Per competitor: retired, laps, race_time. Sort & assign positions.
    comp_stats = {}
    for cid, rs in comp_rows.items():
        all_laps = [ms for r in rs for ms in r.laps]
        comp_stats[cid] = {
            "retired": all(r.retired for r in rs) if rs else False,
            "laps": len(all_laps),
            "time": sum(all_laps),
        }
    ordered = sorted(
        comp_rows.keys(),
        key=lambda c: (
            comp_stats[c]["retired"],
            -comp_stats[c]["laps"],
            comp_stats[c]["time"],
            c,
        ),
    )
    pos_of = {cid: i + 1 for i, cid in enumerate(ordered)}

    out: list[SessionExtract] = []
    for r in rows:
        laps = r.laps
        out.append(SessionExtract(
            circuit_name=circuit_name,
            log_date=log_date,
            title1=race.title1,
            title2=race.title2,
            session_seq=session_seq,
            session_type=cls.session_type,
            team_mode=cls.team_mode,
            driver_canonical=r.canonical,
            driver_raw=r.raw_name,
            kart_number=r.kart_number,
            team_key=r.team_key,
            drteam_names=list(r.drteam_names),
            laps_ms=list(laps),
            total_laps=len(laps),
            best_lap_ms=min(laps),
            avg_lap_ms=statistics.fmean(laps),
            median_lap_ms=int(statistics.median(laps)),
            final_position=pos_of[comp_of[r.row_id]],
            apex_last_position=r.apex_last_position,
            duration_s=race.duration_s,
        ))
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/ranking/test_results.py -q`
Expected: PASS (3 passed). If `test_endurance_team_position_shared_by_all_kart_drivers` fails because `classify_race` returns `individual` (the synthetic laps don't trip the endurance threshold), adjust the test's title to `"24 HORAS"` and keep `drteam` swaps — endurance is detected by swap OR duration OR title regex (`classify_session`). Do not weaken the production logic to fit the test.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ranking/results.py backend/tests/ranking/test_results.py
git commit -m "feat(ranking): results — reconstruct finishing order from laps, team-shared"
```

---

### Task 5: Rewrite `extractor.py` as the façade

**Files:**
- Modify (full rewrite): `backend/app/services/ranking/extractor.py`

- [ ] **Step 1: Replace the file contents**

Overwrite `backend/app/services/ranking/extractor.py` with:
```python
"""Façade: raw Apex recording → list[SessionExtract].

Composes the three pure stages:
  segmenter.segment_log  → list[Segment]   (INIT-grid boundaries)
  assembler.assemble_races → list[Race]    (stitch reconnects)
  results.reconstruct_race → list[SessionExtract] (lap-based finish)

Public API is unchanged: `extract_sessions(filepath, *, circuit_name,
log_date)` and `SessionExtract` are still importable from here, so
`processor.py` and the ranking tests need no import changes. Never
raises on malformed wire data. `app/apex/*` is not mutated (pinned by
tests/ranking/test_parser_contract.py).
"""
from __future__ import annotations

from .segmenter import segment_log
from .assembler import assemble_races
from .results import SessionExtract, reconstruct_race

__all__ = ["extract_sessions", "SessionExtract"]


def extract_sessions(
    filepath: str, *, circuit_name: str, log_date: str
) -> list[SessionExtract]:
    segments = segment_log(filepath, circuit_name=circuit_name, log_date=log_date)
    races = assemble_races(segments)
    out: list[SessionExtract] = []
    seq = 0
    for race in races:
        rows = reconstruct_race(
            race,
            circuit_name=circuit_name,
            log_date=log_date,
            session_seq=seq + 1,
        )
        if rows:
            seq += 1
            out.extend(rows)
    return out
```

- [ ] **Step 2: Compile + import smoke check**

Run: `cd backend && python -c "from app.services.ranking.extractor import extract_sessions, SessionExtract; print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Run parser-contract + the new stage tests**

Run: `cd backend && python -m pytest tests/ranking/test_parser_contract.py tests/ranking/test_segmenter.py tests/ranking/test_assembler.py tests/ranking/test_results.py -q`
Expected: all PASS. (`test_parser_contract.py` proves `app/apex/*` untouched.)

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ranking/extractor.py
git commit -m "refactor(ranking): extractor is now a thin segmenter→assembler→results façade"
```

---

### Task 6: Persist `apex_last_position` in the upsert

`SessionExtract` now carries `apex_last_position`. Write it into the `SessionResult` row. No rating-logic change (endurance positions are now identical per kart, so `effective_scores`'s per-`team_key` conflict path stays dormant as defence).

**Files:**
- Modify: `backend/app/services/ranking/processor.py` (the `SessionResult(...)` constructor + the stint-merge `SessionExtract(...)` rebuild)

- [ ] **Step 1: Add the field to the stint-merge rebuild**

In `backend/app/services/ranking/processor.py`, find the merged `SessionExtract(` constructed in the per-canon aggregation (the block ending with `final_position=rep.final_position,` then `duration_s=rep.duration_s,`). Add `apex_last_position=rep.apex_last_position,` immediately before `duration_s=rep.duration_s,`:
```python
                final_position=rep.final_position,
                apex_last_position=rep.apex_last_position,
                duration_s=rep.duration_s,
            ))
```

- [ ] **Step 2: Write it into the SessionResult upsert**

In the `sr = SessionResult(` constructor, find:
```python
                final_position=(s.final_position if is_race else None),
                session_type=agg_group[0].session_type,
```
Insert between them:
```python
                final_position=(s.final_position if is_race else None),
                apex_last_position=s.apex_last_position,
                session_type=agg_group[0].session_type,
```

- [ ] **Step 3: Compile-check**

Run: `cd backend && python -m py_compile app/services/ranking/processor.py`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/ranking/processor.py
git commit -m "feat(ranking): persist diagnostic apex_last_position into session_results"
```

---

### Task 7: Production fixtures + integration tests

Generate trimmed real-log fixtures on the production server (the recordings live there) and copy them into the repo, then assert the headline outcomes end-to-end through `extract_sessions`.

**Files:**
- Create: `backend/tests/ranking/fixtures/ariza_heats_2026-05-02.log`
- Create: `backend/tests/ranking/fixtures/santos_12h_2026-04-25.log`
- Create: `backend/tests/ranking/test_race_classification_integration.py`
- Check: `backend/tests/ranking/fixtures/.gitignore` (ensure these two `.log` files are NOT ignored — the existing `eupen_column.log`/`rkc_inline.log` are committed, so plain `*.log` is allowed; if the `.gitignore` excludes new logs, add explicit `!ariza_heats_2026-05-02.log` and `!santos_12h_2026-04-25.log` lines).

- [ ] **Step 1: Produce the trimmed fixtures from the prod logs**

The recordings are gz on the server. `parse_log_file` accepts `.log` (plain). Produce decompressed, time-trimmed slices. Run locally (writes the two fixture files into the repo):
```bash
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252 \
  'cd /home/ubuntu/boxboxnow-v2 && docker compose exec -T backend python3 - <<PY
import gzip
def trim(src, dst, start, end):
    out=[]
    with gzip.open(src,"rt",errors="replace") as f:
        for line in f:
            tsfield=line.split("|",1)[0].strip()
            # keep header-ish lines (no leading timestamp) AND lines in window
            if not tsfield[:4].isdigit():
                out.append(line); continue
            if start <= tsfield <= end:
                out.append(line)
    open(dst,"w").write("".join(out))
    print(dst, len(out), "lines")
trim("/app/data/recordings/Ariza/2026-05-02.log.gz","/tmp/ariza_heats.log","2026-05-02 10:30","2026-05-02 11:15")
trim("/app/data/recordings/Santos/2026-04-25.log.gz","/tmp/santos_12h.log","2026-04-25 00:00","2026-04-25 23:59")
PY'
scp -i /Users/jizcue/dumps/Claves_KN_PROD.pem \
  ubuntu@3.252.140.252:/tmp/ariza_heats.log \
  backend/tests/ranking/fixtures/ariza_heats_2026-05-02.log
scp -i /Users/jizcue/dumps/Claves_KN_PROD.pem \
  ubuntu@3.252.140.252:/tmp/santos_12h.log \
  backend/tests/ranking/fixtures/santos_12h_2026-04-25.log
```
NOTE: the exact line/timestamp format depends on `parse_log_file`'s reader. If the trimmed file yields zero sessions in Step 3, fall back to copying the FULL decompressed logs (no trim) — correctness of the test matters more than fixture size:
```bash
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252 \
  'cd /home/ubuntu/boxboxnow-v2 && docker compose exec -T backend python3 -c "import gzip,shutil; [shutil.copyfileobj(gzip.open(s,\"rb\"),open(d,\"wb\")) for s,d in [(\"/app/data/recordings/Ariza/2026-05-02.log.gz\",\"/tmp/ariza_heats.log\"),(\"/app/data/recordings/Santos/2026-04-25.log.gz\",\"/tmp/santos_12h.log\")]]"'
# then scp as above
```

- [ ] **Step 2: Write the integration test**

Create `backend/tests/ranking/test_race_classification_integration.py`:
```python
import os
from collections import defaultdict

import pytest

from app.services.ranking.extractor import extract_sessions

FX = os.path.join(os.path.dirname(__file__), "fixtures")
ARIZA = os.path.join(FX, "ariza_heats_2026-05-02.log")
SANTOS = os.path.join(FX, "santos_12h_2026-04-25.log")


@pytest.mark.skipif(not os.path.exists(ARIZA), reason="ariza fixture missing")
def test_ariza_heat_bc_splits_and_winner_is_p1():
    S = extract_sessions(ARIZA, circuit_name="Ariza", log_date="2026-05-02")
    by_seq = defaultdict(list)
    for s in S:
        by_seq[s.session_seq].append(s)
    heat_bc = [rows for rows in by_seq.values()
               if "HEAT B-C" in f"{rows[0].title1} {rows[0].title2}".upper()]
    # Over-merge fixed: HEAT B-C is no longer ONE 26-lap session.
    assert len(heat_bc) >= 2
    for rows in heat_bc:
        assert max(r.total_laps for r in rows) < 20  # not doubled
        # exactly one P1, contiguous 1..N
        positions = sorted(r.final_position for r in rows)
        assert positions[0] == 1
    # Jon del Valle, when present in a HEAT he won, is classified P1 by
    # laps/time (not ~9th alphabetical).
    jon_rows = [r for rows in heat_bc for r in rows
                if "VALLE" in r.driver_raw.upper()]
    assert jon_rows, "Jon del Valle not found in HEAT B-C fixture window"
    assert any(r.final_position == 1 for r in jon_rows)


@pytest.mark.skipif(not os.path.exists(SANTOS), reason="santos fixture missing")
def test_santos_12h_stitches_and_kart9_shared_realistic():
    S = extract_sessions(SANTOS, circuit_name="Santos", log_date="2026-04-25")
    races = defaultdict(list)
    for s in S:
        races[s.session_seq].append(s)
    # The 12h CARRERA is ONE assembled race (stitched), not 2+ fragments.
    carrera = [rows for rows in races.values()
               if rows[0].session_type == "race"
               and "CARRERA" in f"{rows[0].title1} {rows[0].title2}".upper()
               and max(r.total_laps for r in rows) > 200]
    assert len(carrera) == 1
    rows = carrera[0]
    k9 = [r for r in rows if r.kart_number == 9]
    assert k9, "kart 9 not in stitched 12h"
    # All kart-9 drivers share one position, and it is realistic
    # (≫ the bogus fragment P7 — the team really finished ~13th).
    pos = {r.final_position for r in k9}
    assert len(pos) == 1
    assert next(iter(pos)) >= 10
```

- [ ] **Step 3: Run the integration test**

Run: `cd backend && python -m pytest tests/ranking/test_race_classification_integration.py -q`
Expected: PASS (2 passed). If a fixture didn't capture the needed window, regenerate per Step 1's fallback (full log) and re-run. Do NOT relax the assertions to make them pass — adjust the fixture window instead.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/ranking/fixtures/ariza_heats_2026-05-02.log \
        backend/tests/ranking/fixtures/santos_12h_2026-04-25.log \
        backend/tests/ranking/test_race_classification_integration.py \
        backend/tests/ranking/fixtures/.gitignore
git commit -m "test(ranking): prod-fixture integration — Ariza heats split + Santos 12h stitched"
```

---

### Task 8: Reconcile existing ranking tests

The behaviour changed (windowing + positions). Existing tests that asserted the OLD buggy behaviour must be updated to the NEW correct behaviour — not deleted, not weakened to tautology.

**Files:**
- Modify as needed: `backend/tests/ranking/test_extractor.py`, `test_methodology.py`, `test_isolation.py`, `test_classifier.py`

- [ ] **Step 1: Run the full ranking suite to see what moved**

Run: `cd backend && python -m pytest tests/ranking -q`
Expected: `test_parser_contract.py`, `test_segmenter/assembler/results/integration` PASS. Some `test_extractor.py` / `test_methodology.py` / `test_isolation.py` cases may FAIL where they assert title/gap-only windowing or `final_position == last apex RANKING`.

- [ ] **Step 2: Update each failing assertion to the new contract**

For every failure, read the test, decide the CORRECT expectation under the new design (sessions split on INIT-init; `final_position` = reconstructed laps/time order; endurance kart-shared), and update the expected values/fixtures. Where a test used a real fixture (`eupen_column.log`, `rkc_inline.log`), recompute the expected session count / positions by running `extract_sessions` on that fixture once and asserting the now-correct numbers (pin them as constants with a comment explaining they are the reconstructed-order truth). Keep coverage intent; do not convert assertions to `assert True`.

- [ ] **Step 3: Run the full ranking suite green**

Run: `cd backend && python -m pytest tests/ranking -q`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/ranking
git commit -m "test(ranking): update suite to reconstructed-classification contract"
```

---

### Task 9: Pre-deploy dry-run gate on full prod logs

Verify on the COMPLETE production recordings (not just trimmed fixtures) before the user resets prod.

**Files:**
- Create: `backend/scripts/ranking_dryrun.py`

- [ ] **Step 1: Write the dry-run script**

Create `backend/scripts/ranking_dryrun.py`:
```python
"""Pre-deploy gate. Run inside the backend container against the real
recordings. Asserts the two headline fixes before a prod reset.

  docker compose exec -T backend python scripts/ranking_dryrun.py
"""
import sys
from collections import defaultdict

from app.services.ranking.extractor import extract_sessions

ok = True

S = extract_sessions("/app/data/recordings/Ariza/2026-05-02.log.gz",
                     circuit_name="Ariza", log_date="2026-05-02")
by = defaultdict(list)
for s in S:
    by[s.session_seq].append(s)
heat_bc = [r for r in by.values()
           if "HEAT B-C" in f"{r[0].title1} {r[0].title2}".upper()]
print(f"Ariza HEAT B-C races: {len(heat_bc)} (expect >=2)")
if len(heat_bc) < 2:
    ok = False
for rows in heat_bc:
    mx = max(r.total_laps for r in rows)
    print(f"  HEAT B-C race max_laps={mx} (expect <20)")
    if mx >= 20:
        ok = False
jon = [r for rows in heat_bc for r in rows if "VALLE" in r.driver_raw.upper()]
print(f"  Jon del Valle rows in HEAT B-C: positions="
      f"{sorted(r.final_position for r in jon)}")
if not any(r.final_position == 1 for r in jon):
    ok = False

S2 = extract_sessions("/app/data/recordings/Santos/2026-04-25.log.gz",
                      circuit_name="Santos", log_date="2026-04-25")
races = defaultdict(list)
for s in S2:
    races[s.session_seq].append(s)
carrera = [r for r in races.values()
           if r[0].session_type == "race"
           and "CARRERA" in f"{r[0].title1} {r[0].title2}".upper()
           and max(x.total_laps for x in r) > 200]
print(f"Santos 12h CARRERA assembled races (>200 laps): {len(carrera)} (expect 1)")
if len(carrera) != 1:
    ok = False
else:
    k9 = [r for r in carrera[0] if r.kart_number == 9]
    pos = {r.final_position for r in k9}
    print(f"  kart 9 drivers={len(k9)} shared_pos={pos} (expect 1 value, >=10)")
    if len(pos) != 1 or next(iter(pos), 0) < 10:
        ok = False

print("DRYRUN", "OK" if ok else "FAIL")
sys.exit(0 if ok else 1)
```

- [ ] **Step 2: Run full local suite**

Run: `cd backend && python -m pytest tests/ranking -q`
Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/ranking_dryrun.py
git commit -m "chore(ranking): pre-deploy dry-run gate script"
```

- [ ] **Step 4: STOP — operational handoff (not automated here)**

Do NOT deploy or reset from the plan. After all tasks pass, the controller hands back to the user with: push `main`, deploy backend (`git pull && docker compose up -d --build`), run `docker compose exec -T backend python scripts/ranking_dryrun.py` → must print `DRYRUN OK`, THEN the user clicks **Admin → Ranking → Reset completo** (full reprocess of ~1104 logs), then post-reset SANITY spot-check (Jon del Valle Ariza heats P1 with coherent ΔELO; Jorge Izcue 12h reflects the team's real classification).

---

## Self-Review (performed)

**Spec coverage:** segmenter=INIT boundary (Task 2) ✓; assembler stitch rule with exact constants 300 s / 0.5 (Task 3) ✓; reconstruction key `(retired,−laps,time,key)` + endurance kart-shared (Task 4) ✓; façade preserves public API (Task 5) ✓; `apex_last_position` model+migration+persist (Tasks 1,6) ✓; pace/superpole untouched (laps_floor in existing processor — unchanged, noted) ✓; fixtures for the two diagnosed logs + integration asserts Jon→P1 and Santos kart9 shared/realistic (Task 7) ✓; existing-test reconciliation (Task 8) ✓; pre-deploy gate + reset handoff (Task 9 + spec deploy plan) ✓.

**Placeholder scan:** none — every code/test/command step is concrete. The only conditional ("if fixture window empty → use full log") gives an exact fallback command, not a TODO.

**Type consistency:** `Segment`/`_RowState` (segmenter) → consumed unchanged by assembler/results; `Race` (assembler) consumed by `reconstruct_race`; `SessionExtract` field set is a superset of the old one (adds `apex_last_position` only) so `processor.py` keeps working; `extract_sessions` signature identical to current. `classify_session`/`normalize_name`/`parse_log_file`/`ApexMessageParser`/`EventType`/`time_to_ms` referenced exactly as the current extractor uses them.
