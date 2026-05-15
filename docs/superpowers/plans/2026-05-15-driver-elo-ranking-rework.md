# Driver ELO/Glicko-2 Ranking Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile single-schema ranking log parser with a dedicated extractor that reuses the live Apex parser read-only, add race-vs-pace methodology (races → real final position with endurance = team position + individual pace; pace → corrected avg lap), and reprocess the full historical corpus.

**Architecture:** A new ranking-owned `extractor.py` drives `app/apex/replay.parse_log_file()` + `app/apex/parser.ApexMessageParser` (both unmodified, read-only) to produce one `SessionExtract` per (session, driver). A revised `processor.py` applies the Glicko-2 methodology. `app/services/ranking/log_parser.py` is removed. Spec: `docs/superpowers/specs/2026-05-15-driver-elo-ranking-rework-design.md`.

**Tech Stack:** Python 3.13, SQLAlchemy async + SQLite (`backend/data/boxboxnow.db`), pytest + pytest-asyncio. All commands run from `backend/` with `.venv/bin/python`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `backend/pyproject.toml` | Modify | Add `[tool.pytest.ini_options] asyncio_mode = "auto"` |
| `backend/tests/ranking/__init__.py` | Create | Test package marker |
| `backend/tests/ranking/fixtures/` | Create | Small real log fixtures (RKC inline-ms + EUPEN column-time) |
| `backend/tests/ranking/test_parser_contract.py` | Create | Characterization tests pinning the live parser's event API |
| `backend/app/services/ranking/classifier.py` | Create | Pure: title/duration → `session_type`, `team_mode` |
| `backend/tests/ranking/test_classifier.py` | Create | Classifier unit tests |
| `backend/app/services/ranking/extractor.py` | Create | Raw log → `list[SessionExtract]` (segmentation + per-driver extraction) via live parser |
| `backend/tests/ranking/test_extractor.py` | Create | Extractor unit/integration tests on fixtures |
| `backend/app/services/ranking/log_parser.py` | Delete | Replaced by `extractor.py` |
| `backend/app/services/ranking/processor.py` | Modify | Use `extractor`; new methodology; chronological order; populate circuit ratings |
| `backend/tests/ranking/test_methodology.py` | Create | Pure-function tests for `effective` score + pace ordering |
| `backend/app/models/schemas.py` | Modify | `SessionResult`: new cols + new unique key |
| `backend/app/models/database.py` | Modify | Recreate `session_results` migration |
| `backend/app/api/ranking_routes.py` | Modify | Remove 100 cap; `min_sessions`/pagination params; surface `session_type`/`effective` |
| `backend/tests/ranking/test_isolation.py` | Create | Regression: ranking pkg does not import `app.apex` except the two read-only entrypoints |
| `backend/scripts/ranking_sanity.py` | Create | Post-reprocess sanity metrics script |

`extractor.py` and `processor.py` stay two independently testable units. `app/apex/*`, `app/engine/*`, replay/live routes are **never modified**.

---

## Task 0: Test scaffolding

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/tests/ranking/__init__.py`

- [ ] **Step 1: Add pytest asyncio config**

In `backend/pyproject.toml`, append at end of file:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Create test package**

Create `backend/tests/ranking/__init__.py` (empty file).

- [ ] **Step 3: Verify pytest collects**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: PASS or "no tests ran" (no errors, asyncio_mode recognized).

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml backend/tests/ranking/__init__.py
git commit -m "test(ranking): pytest asyncio config + test package"
```

---

## Task 1: Capture real fixtures + parser contract test

We must not guess the live parser's behaviour. Capture two tiny real logs (one of each schema) and assert the exact events `ApexMessageParser` emits.

**Files:**
- Create: `backend/tests/ranking/fixtures/rkc_inline.log` (trimmed real RKC_Paris log)
- Create: `backend/tests/ranking/fixtures/eupen_column.log` (trimmed real EUPEN log)
- Create: `backend/tests/ranking/test_parser_contract.py`

- [ ] **Step 1: Capture trimmed fixtures from the server**

Run (creates two ~200-block trimmed logs locally):

```bash
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252 \
 'cd /home/ubuntu/boxboxnow-v2/backend/data/recordings && \
  zcat RKC_Paris/2026-04-18.log.gz | head -4000 && echo "---SPLIT---" && \
  zcat EUPEN/2026-04-04.log.gz | head -4000' \
 > /tmp/fixtures_raw.txt
cd /Users/jizcue/boxboxnow-v2/backend
mkdir -p tests/ranking/fixtures
awk 'BEGIN{f="tests/ranking/fixtures/rkc_inline.log"} /^---SPLIT---$/{f="tests/ranking/fixtures/eupen_column.log";next}{print > f}' /tmp/fixtures_raw.txt
wc -l tests/ranking/fixtures/*.log
```
Expected: two non-empty `.log` files.

- [ ] **Step 2: Write the characterization test**

Create `backend/tests/ranking/test_parser_contract.py`:

```python
"""Pins the live ApexMessageParser event API the extractor depends on.
If app/apex/parser.py changes shape, this fails first — by design."""
from collections import Counter
from pathlib import Path

from app.apex.replay import parse_log_file
from app.apex.parser import ApexMessageParser, EventType

FIX = Path(__file__).parent / "fixtures"


def _event_types(log_name: str) -> Counter:
    parser = ApexMessageParser()
    counts: Counter = Counter()
    for _ts, message in parse_log_file(str(FIX / log_name)):
        for ev in parser.parse(message):
            counts[ev.type] += 1
    return counts


def test_rkc_inline_emits_core_events():
    c = _event_types("rkc_inline.log")
    # RKC family: inline lap ms + ranking present
    assert c[EventType.LAP_MS] > 0
    assert c[EventType.RANKING] > 0
    assert c[EventType.INIT] > 0  # grid parsed → row_to_kart populated


def test_eupen_column_emits_core_events():
    c = _event_types("eupen_column.log")
    # EUPEN family: lap times via column LAP events (time strings), ranking present
    assert c[EventType.LAP] > 0
    assert c[EventType.RANKING] > 0
```

- [ ] **Step 3: Run the contract test**

Run: `.venv/bin/python -m pytest tests/ranking/test_parser_contract.py -v`
Expected: PASS. If `test_eupen_column_emits_core_events` shows `LAP == 0`, inspect with:
`.venv/bin/python -c "from app.apex.replay import parse_log_file; from app.apex.parser import ApexMessageParser; p=ApexMessageParser(); [print(e.type,e.row_id,e.value[:20]) for ts,m in parse_log_file('tests/ranking/fixtures/eupen_column.log') for e in p.parse(m)][:1]"`
and adjust the asserted EventType to whatever the parser actually emits for that schema's lap times (e.g. `LAP_MS`). Record the real mapping in a top-of-file comment. This is the empirical contract the extractor builds on.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/ranking/fixtures backend/tests/ranking/test_parser_contract.py
git commit -m "test(ranking): real fixtures + live-parser event contract"
```

---

## Task 2: Session classifier (pure)

**Files:**
- Create: `backend/app/services/ranking/classifier.py`
- Create: `backend/tests/ranking/test_classifier.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/ranking/test_classifier.py`:

```python
from app.services.ranking.classifier import classify_session, SessionClass


def test_race_keyword_french():
    c = classify_session("24 HEURES ESSEC", "24H ESSEC", duration_s=3600, had_driver_swap=True)
    assert c.session_type == "race"
    assert c.team_mode == "endurance"


def test_quali_keyword_is_pace_even_if_long():
    c = classify_session("24 HEURES ESSEC", "ESSAIS CHRONOS Q1", duration_s=1800, had_driver_swap=False)
    assert c.session_type == "pace"


def test_non_race_keyword_wins_over_race_keyword():
    c = classify_session("", "RACE CHRONOS", duration_s=1800, had_driver_swap=False)
    assert c.session_type == "pace"


def test_ambiguous_short_is_pace():
    c = classify_session("", "Session 7", duration_s=600, had_driver_swap=False)
    assert c.session_type == "pace"


def test_ambiguous_long_is_race_individual():
    c = classify_session("", "14. RACING - 11:20", duration_s=900, had_driver_swap=False)
    assert c.session_type == "race"
    assert c.team_mode == "individual"


def test_endurance_by_duration():
    c = classify_session("", "CARRERA", duration_s=3000, had_driver_swap=False)
    assert c.session_type == "race"
    assert c.team_mode == "endurance"  # >= 40 min


def test_spanish_practice():
    c = classify_session("FP3", "", duration_s=700, had_driver_swap=False)
    assert c.session_type == "pace"
```

- [ ] **Step 2: Run, verify fail**

Run: `.venv/bin/python -m pytest tests/ranking/test_classifier.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.ranking.classifier`).

- [ ] **Step 3: Implement classifier**

Create `backend/app/services/ranking/classifier.py`:

```python
"""Pure session classification: title + duration + swap → type/mode.
No I/O, no DB — trivially unit-testable. Thresholds are the spec's
tunables (race/pace 12 min, endurance 40 min)."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

RACE_PACE_THRESHOLD_S = 12 * 60
ENDURANCE_THRESHOLD_S = 40 * 60

_NON_RACE = (
    "ESSAIS", "CHRONOS", "CRONOS", "QUALI", "LIBRE", "LIBRES", "PRACTICE",
    "FREE", "PROVE", "ENTRENO", "ENTRENAMIENTO", "WARM", "BRIEFING", "ACCUEIL",
)
_NON_RACE_RE = re.compile(r"\b(Q\d+|FP\d+)\b", re.I)
_SESSION_GENERIC_RE = re.compile(r"^\s*SESS(ION|ION|ÍON|IÓN)?\s*\d*\s*$", re.I)
_RACE = (
    "CARRERA", "COURSE", "RACE", "GARA", "RENNEN", "FINAL", "FINALE", "GP",
    "GRAN PREMIO", "GRAND PRIX", "MANGA", "HEAT", "RACING", "RESIST",
    "ENDURANCE",
)
_DURATION_RE = re.compile(r"\d+\s*(H|HEURES|HOURS|HORAS|ORE|STUNDEN|HRS?)\b", re.I)
_ENDURANCE_KW = ("HEURE", "HOUR", "HORA", "ORE", "STUNDEN", "ENDURANCE", "RESIST")


@dataclass
class SessionClass:
    session_type: str  # "race" | "pace"
    team_mode: str      # "endurance" | "individual"


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.upper()


def classify_session(
    title1: str, title2: str, *, duration_s: int, had_driver_swap: bool
) -> SessionClass:
    blob = f"{_norm(title1)} {_norm(title2)}".strip()

    has_non_race = any(k in blob for k in _NON_RACE) or bool(_NON_RACE_RE.search(blob)) \
        or bool(_SESSION_GENERIC_RE.match(blob))
    has_race = any(k in blob for k in _RACE) or bool(_DURATION_RE.search(blob))

    if has_non_race and not (has_race and not has_non_race):
        session_type = "pace"
    elif has_race:
        session_type = "race"
    else:
        session_type = "race" if duration_s >= RACE_PACE_THRESHOLD_S else "pace"

    endurance = (
        had_driver_swap
        or duration_s >= ENDURANCE_THRESHOLD_S
        or any(k in blob for k in _ENDURANCE_KW)
    )
    return SessionClass(
        session_type=session_type,
        team_mode="endurance" if (session_type == "race" and endurance) else "individual",
    )
```

- [ ] **Step 4: Run, verify pass**

Run: `.venv/bin/python -m pytest tests/ranking/test_classifier.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ranking/classifier.py backend/tests/ranking/test_classifier.py
git commit -m "feat(ranking): pure session classifier (race/pace, endurance/individual)"
```

---

## Task 3: Extractor — `SessionExtract` + segmentation

**Files:**
- Create: `backend/app/services/ranking/extractor.py`
- Create: `backend/tests/ranking/test_extractor.py`

- [ ] **Step 1: Write failing segmentation test**

Create `backend/tests/ranking/test_extractor.py`:

```python
from pathlib import Path
from app.services.ranking.extractor import extract_sessions, SessionExtract

FIX = Path(__file__).parent / "fixtures"


def test_rkc_yields_sessions_with_drivers_and_laps():
    sessions = extract_sessions(str(FIX / "rkc_inline.log"), circuit_name="RKC_Paris", log_date="2026-04-18")
    assert len(sessions) >= 1
    s0 = sessions[0]
    assert isinstance(s0, SessionExtract)
    assert s0.circuit_name == "RKC_Paris"
    assert s0.log_date == "2026-04-18"
    assert s0.total_laps >= 1
    assert s0.avg_lap_ms > 0
    assert s0.session_seq >= 1


def test_eupen_column_format_yields_laps():
    sessions = extract_sessions(str(FIX / "eupen_column.log"), circuit_name="EUPEN", log_date="2026-04-04")
    # The old regex parser produced ZERO here — the bug under fix.
    assert any(s.total_laps >= 1 for s in sessions)


def test_session_seq_is_monotonic_per_log():
    sessions = extract_sessions(str(FIX / "rkc_inline.log"), circuit_name="RKC_Paris", log_date="2026-04-18")
    seqs = sorted({s.session_seq for s in sessions})
    assert seqs == list(range(1, len(seqs) + 1))
```

- [ ] **Step 2: Run, verify fail**

Run: `.venv/bin/python -m pytest tests/ranking/test_extractor.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.ranking.extractor`).

- [ ] **Step 3: Implement extractor**

Create `backend/app/services/ranking/extractor.py`:

```python
"""Raw Apex recording → list[SessionExtract].

Drives the LIVE parser read-only (app/apex/replay + app/apex/parser).
Nothing here mutates app/apex/*. This is the only ranking file coupled
to the live parser's API; the parser contract is pinned by
tests/ranking/test_parser_contract.py.
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
    team_key: str               # kart-as-team key for endurance grouping
    laps_ms: list[int] = field(default_factory=list)
    total_laps: int = 0
    best_lap_ms: int = 0
    avg_lap_ms: float = 0.0
    median_lap_ms: int = 0
    final_position: int | None = None
    duration_s: int = 0


class _RowState:
    __slots__ = ("driver_raw", "driver_seen", "kart", "laps", "last_pos", "retired")

    def __init__(self):
        self.driver_raw: str = ""
        self.driver_seen: set[str] = set()
        self.kart: int | None = None
        self.laps: list[int] = []
        self.last_pos: int | None = None
        self.retired: bool = False


def _lap_ms_from_event(ev) -> int | None:
    if ev.type == EventType.LAP_MS:
        try:
            return int(ev.value)
        except (TypeError, ValueError):
            return None
    if ev.type == EventType.LAP:
        ms = time_to_ms(ev.value)
        return ms or None
    return None


def _finalize(circuit, log_date, t1, t2, seq, rows, parser, first_ts, last_ts):
    duration_s = int((last_ts - first_ts).total_seconds()) if first_ts and last_ts else 0
    had_swap = any(len(r.driver_seen) > 1 for r in rows.values())
    cls = classify_session(t1, t2, duration_s=duration_s, had_driver_swap=had_swap)

    # Resolve kart per row (live parser keeps row_to_kart from the grid).
    for rid, r in rows.items():
        if r.kart is None:
            r.kart = parser.row_to_kart.get(rid)

    rated = [(rid, r) for rid, r in rows.items()
             if r.driver_raw and len([l for l in r.laps if MIN_LAP_MS <= l <= MAX_LAP_MS]) >= 1]
    out: list[SessionExtract] = []
    if len(rated) < 1:
        return out

    # Real finishing position: smaller = better; retired sorted last.
    def pos_key(item):
        _rid, r = item
        p = r.last_pos if r.last_pos is not None else 10_000
        return (1 if r.retired else 0, p)

    for rid, r in rated:
        laps = sorted(l for l in r.laps if MIN_LAP_MS <= l <= MAX_LAP_MS)
        if not laps:
            continue
        avg = sum(laps) / len(laps)
        canon = normalize_name(r.driver_raw)
        if not canon:
            continue
        out.append(SessionExtract(
            circuit_name=circuit, log_date=log_date, title1=t1, title2=t2,
            session_seq=seq, session_type=cls.session_type, team_mode=cls.team_mode,
            driver_canonical=canon, driver_raw=r.driver_raw,
            kart_number=r.kart,
            team_key=str(r.kart) if r.kart is not None else f"row:{rid}",
            laps_ms=laps, total_laps=len(laps), best_lap_ms=laps[0],
            avg_lap_ms=avg, median_lap_ms=laps[len(laps) // 2],
            final_position=r.last_pos,
            duration_s=duration_s,
        ))
    return out


def extract_sessions(filepath: str, *, circuit_name: str, log_date: str) -> list[SessionExtract]:
    parser = ApexMessageParser()
    blocks = parse_log_file(filepath)

    sessions: list[SessionExtract] = []
    seq = 0
    t1 = t2 = ""
    rows: dict[str, _RowState] = {}
    first_ts = last_ts = None
    last_lap_ts = None

    def flush():
        nonlocal sessions, rows, first_ts, last_ts
        if rows and any(r.laps for r in rows.values()):
            sessions.extend(_finalize(
                circuit_name, log_date, t1, t2, seq, rows, parser, first_ts, last_ts))
        rows = {}
        first_ts = last_ts = None

    for ts, message in blocks:
        events = parser.parse(message)
        title_changed = False
        for ev in events:
            if ev.type == EventType.CATEGORY and ev.value != t1:
                title_changed = True
            elif ev.type == EventType.SESSION_TITLE and ev.value != t2:
                title_changed = True

        gap_split = (
            last_lap_ts is not None
            and (ts - last_lap_ts).total_seconds() > GAP_SPLIT_S
            and any(r.laps for r in rows.values())
        )
        if title_changed or gap_split:
            flush()
            seq += 1 if (title_changed or gap_split) else 0

        for ev in events:
            if ev.type == EventType.CATEGORY:
                t1 = ev.value
            elif ev.type == EventType.SESSION_TITLE:
                t2 = ev.value
            elif ev.type in (EventType.DRIVER_TEAM, EventType.TEAM):
                if not ev.row_id:
                    continue
                r = rows.setdefault(ev.row_id, _RowState())
                name = ev.value.strip()
                if name:
                    r.driver_raw = name
                    r.driver_seen.add(name)
            elif ev.type == EventType.RANKING and ev.row_id:
                r = rows.setdefault(ev.row_id, _RowState())
                try:
                    r.last_pos = int(ev.value)
                except (TypeError, ValueError):
                    pass
            elif ev.type == EventType.STATUS and ev.row_id and ev.value == "sr":
                rows.setdefault(ev.row_id, _RowState()).retired = True
            elif ev.type in (EventType.LAP, EventType.LAP_MS) and ev.row_id:
                ms = _lap_ms_from_event(ev)
                if ms is None:
                    continue
                r = rows.setdefault(ev.row_id, _RowState())
                r.laps.append(ms)
                if first_ts is None:
                    first_ts = ts
                last_ts = ts
                last_lap_ts = ts

        if seq == 0 and rows and any(r.laps for r in rows.values()):
            seq = 1

    flush()
    return sessions
```

Note: `seq` starts at 0; the first session with laps sets `seq = 1`; each `flush()` boundary increments. The test `test_session_seq_is_monotonic_per_log` guards correctness — if it fails, fix the increment so each emitted session gets a distinct 1..N `session_seq`.

- [ ] **Step 4: Run, verify pass**

Run: `.venv/bin/python -m pytest tests/ranking/test_extractor.py -v`
Expected: PASS (3 tests). If `test_eupen_column_format_yields_laps` fails, use the diagnostic from Task 1 Step 3 to confirm which `EventType` carries EUPEN laps and that `DRIVER_TEAM`/`TEAM` carries its driver name; adjust `_lap_ms_from_event` / the driver-event branch accordingly (this is the empirical contract).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ranking/extractor.py backend/tests/ranking/test_extractor.py
git commit -m "feat(ranking): dedicated extractor reusing live parser (all Apex schemas)"
```

---

## Task 4: Methodology — pure functions

**Files:**
- Create: `backend/tests/ranking/test_methodology.py`
- Modify: `backend/app/services/ranking/processor.py` (add pure helpers only)

- [ ] **Step 1: Write failing tests**

Create `backend/tests/ranking/test_methodology.py`:

```python
from app.services.ranking.processor import effective_scores, RatedDriver


def _rd(name, team_key, corrected_ms, team_pos):
    return RatedDriver(name=name, team_key=team_key,
                       corrected_avg_ms=corrected_ms, team_position=team_pos)


def test_effective_blends_team_and_pace_w07():
    # 3 teams; driver A fast in losing team, B slow in winning team.
    field = [
        _rd("A", "t1", 60000.0, 3),  # slowest team result, fastest pace
        _rd("B", "t2", 62000.0, 1),  # best team result, slowest pace
        _rd("C", "t3", 61000.0, 2),
    ]
    scores = effective_scores(field, w=0.7)
    # B still best (team dominates at w=0.7) but A closes the gap vs pure position.
    assert scores["B"] < scores["C"] < scores["A"]
    assert 0.0 <= min(scores.values()) and max(scores.values()) <= 1.0


def test_single_team_degrades_to_pace_order():
    field = [_rd("A", "t1", 61000.0, 1), _rd("B", "t1", 60000.0, 1)]
    scores = effective_scores(field, w=0.7)
    assert scores["B"] < scores["A"]  # pure pace when n_teams == 1
```

- [ ] **Step 2: Run, verify fail**

Run: `.venv/bin/python -m pytest tests/ranking/test_methodology.py -v`
Expected: FAIL (`ImportError: cannot import name 'effective_scores'`).

- [ ] **Step 3: Add pure helpers to processor.py**

In `backend/app/services/ranking/processor.py`, add after the constants block (after line ~61, before `# ─── Driver canonicalisation helpers ───`):

```python
from dataclasses import dataclass as _dataclass


@_dataclass
class RatedDriver:
    name: str
    team_key: str
    corrected_avg_ms: float
    team_position: int | None  # real finishing position (team or individual)


def _pace_pctile(field: list["RatedDriver"]) -> dict[str, float]:
    order = sorted(field, key=lambda d: d.corrected_avg_ms)
    n = len(order)
    if n == 1:
        return {order[0].name: 0.0}
    return {d.name: i / (n - 1) for i, d in enumerate(order)}


def effective_scores(field: list["RatedDriver"], *, w: float = 0.7) -> dict[str, float]:
    """Lower = better. Race ordering key (spec §6.A).
    effective = w*norm_team_pos + (1-w)*pace_pctile, both in [0,1].
    n_teams == 1 → pure pace."""
    pace = _pace_pctile(field)
    teams = sorted({d.team_key for d in field if d.team_position is not None})
    pos_by_team = {}
    for d in field:
        if d.team_position is not None:
            pos_by_team.setdefault(d.team_key, d.team_position)
    n_teams = len(teams)
    if n_teams <= 1:
        return dict(pace)
    ranked_teams = sorted(teams, key=lambda tk: pos_by_team[tk])
    norm_team = {tk: i / (n_teams - 1) for i, tk in enumerate(ranked_teams)}
    out: dict[str, float] = {}
    for d in field:
        if d.team_position is None or d.team_key not in norm_team:
            out[d.name] = pace[d.name]
        else:
            out[d.name] = w * norm_team[d.team_key] + (1 - w) * pace[d.name]
    return out
```

- [ ] **Step 4: Run, verify pass**

Run: `.venv/bin/python -m pytest tests/ranking/test_methodology.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ranking/processor.py backend/tests/ranking/test_methodology.py
git commit -m "feat(ranking): effective-score methodology helpers (team pos + pace, w=0.7)"
```

---

## Task 5: Schema migration — `session_results` new columns + new unique key

**Files:**
- Modify: `backend/app/models/schemas.py` (class `SessionResult`)
- Modify: `backend/app/models/database.py` (migration: recreate table)

- [ ] **Step 1: Update the model**

In `backend/app/models/schemas.py`, in `class SessionResult`, add these columns after `final_position` and replace the `__table_args__` UniqueConstraint:

```python
    session_seq = Column(Integer, default=1, nullable=False)
    session_type = Column(String(8), default="pace", nullable=False)   # race|pace
    team_mode = Column(String(12), default="individual", nullable=False)
    effective_score = Column(Float, nullable=True)
    duration_s = Column(Integer, default=0, nullable=False)
```

Change the `UniqueConstraint` inside `__table_args__` from
`("circuit_name", "log_date", "title1", "title2", "driver_id", ...)` to:

```python
        UniqueConstraint("circuit_name", "log_date", "session_seq", "driver_id",
                         name="uq_session_result"),
```
(Keep the constraint's existing `name=` if it differs; the name must match what database.py drops/recreates.)

- [ ] **Step 2: Add the recreate migration**

In `backend/app/models/database.py`, inside the migration routine (the function that runs the `ALTER TABLE` blocks; locate it by `grep -n "ALTER TABLE circuits ADD COLUMN track_polyline" app/models/database.py` and add a new idempotent block near the other table-recreate blocks, e.g. after the `live_race_state` recreate):

```python
        # Ranking rework 2026-05-15: session_results gains session_seq /
        # session_type / team_mode / effective_score / duration_s and a
        # new unique key (circuit, date, session_seq, driver). SQLite
        # can't ALTER a constraint and the rows are regenerated by the
        # ranking reprocess anyway, so drop+recreate is safe + simplest.
        try:
            res = await conn.execute(text("PRAGMA table_info(session_results)"))
            cols = {row[1] for row in res.fetchall()}
            if "session_seq" not in cols:
                await conn.execute(text("DROP TABLE IF EXISTS rating_history"))
                await conn.execute(text("DROP TABLE IF EXISTS session_results"))
        except Exception:
            pass
```
(`rating_history` is dropped too because it FKs `session_results.id`; both are fully regenerated by the reprocess. `Base.metadata.create_all` later in the same routine recreates them from the updated models.)

- [ ] **Step 3: Verify migration runs**

Run: `.venv/bin/python -c "import asyncio; from app.models.database import init_db; asyncio.run(init_db())"`
(Use the actual init entrypoint — `grep -n "create_all\|async def init" app/models/database.py` to confirm its name; substitute if not `init_db`.)
Expected: no exception; then verify columns:
`.venv/bin/python -c "import sqlite3; c=sqlite3.connect('data/boxboxnow.db'); print([r[1] for r in c.execute('PRAGMA table_info(session_results)')])"`
Expected: list includes `session_seq, session_type, team_mode, effective_score, duration_s`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/schemas.py backend/app/models/database.py
git commit -m "feat(ranking): session_results new columns + (circuit,date,seq,driver) unique key"
```

---

## Task 6: Processor — consume `SessionExtract`, new methodology, chronological order

**Files:**
- Modify: `backend/app/services/ranking/processor.py`
- Delete: `backend/app/services/ranking/log_parser.py`
- Modify: `backend/tests/ranking/test_extractor.py` (add integration test)

- [ ] **Step 1: Write failing integration test**

Append to `backend/tests/ranking/test_extractor.py`:

```python
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models.schemas import Base, DriverRating, SessionResult, DriverCircuitRating
from app.services.ranking.processor import apply_extracts


@pytest.fixture
async def db():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(eng, expire_on_commit=False)
    async with Session() as s:
        yield s


async def test_apply_extracts_populates_global_and_circuit_ratings(db):
    sessions = extract_sessions(str(FIX / "rkc_inline.log"),
                                circuit_name="RKC_Paris", log_date="2026-04-18")
    assert sessions, "fixture must yield sessions"
    await apply_extracts(sessions, db)
    await db.commit()
    from sqlalchemy import select, func
    n_global = (await db.execute(select(func.count()).select_from(DriverRating))).scalar()
    n_circuit = (await db.execute(select(func.count()).select_from(DriverCircuitRating))).scalar()
    n_results = (await db.execute(select(func.count()).select_from(SessionResult))).scalar()
    assert n_global > 0
    assert n_circuit > 0          # the prod bug: this was 0
    assert n_results > 0
```

- [ ] **Step 2: Run, verify fail**

Run: `.venv/bin/python -m pytest tests/ranking/test_extractor.py::test_apply_extracts_populates_global_and_circuit_ratings -v`
Expected: FAIL (`ImportError: cannot import name 'apply_extracts'`).

- [ ] **Step 3: Rewrite `_apply_session` → `apply_extracts` and rewire**

In `backend/app/services/ranking/processor.py`:

(a) Replace the import line `from .log_parser import parse_log, SessionDriverResult` with:
```python
from .extractor import extract_sessions, SessionExtract
```

(b) Replace the entire `async def _apply_session(...)` function (lines ~124–304) with a new `apply_extracts` that: groups the `list[SessionExtract]` by `(circuit, log_date, session_seq)`; per group applies kart-bias correction (per `team_key` mean vs field mean) to get `corrected_avg_ms`; builds `RatedDriver` list; computes the ordering key — for `session_type == "race"` with ≥1 non-null `final_position` use `effective_scores(field, w=0.7)`, else use raw `corrected_avg_ms` rank (pace path); resolves/creates drivers via the existing `_resolve_or_create_driver`; idempotently upserts `SessionResult` rows (now keyed by `session_seq`) writing the new columns (`session_type`, `team_mode`, `effective_score`, `duration_s`, real `final_position`); and applies the existing Glicko-2 pairwise `update()` for BOTH the global `DriverRating` and the per-circuit `DriverCircuitRating` (preserve the existing dual-track code — copy its structure from the old function so `driver_circuit_ratings` is populated), with pairwise scores 1/0.5/0 derived from the ordering key (`<` → 1.0, `>` → 0.0, `abs diff < 1e-9` → 0.5). Keep `MIN_DRIVERS_PER_SESSION`/`MIN_LAPS_PER_DRIVER` (lower the laps floor to 3 when `team_mode == "individual"`).

Concrete skeleton (fill the Glicko dual-track body by copying the existing pre-state load + `update()` + RatingHistory + per-circuit block from the old `_apply_session`, which already worked for the global side):

```python
async def apply_extracts(sessions: list[SessionExtract], db: AsyncSession) -> dict:
    by_group: dict[tuple, list[SessionExtract]] = {}
    for s in sessions:
        by_group.setdefault((s.circuit_name, s.log_date, s.session_seq), []).append(s)

    applied = 0
    for (circuit, log_date, seq), group in sorted(by_group.items()):
        laps_floor = 3 if group[0].team_mode == "individual" else MIN_LAPS_PER_DRIVER
        rated_se = [s for s in group if s.total_laps >= laps_floor]
        if len(rated_se) < MIN_DRIVERS_PER_SESSION:
            continue

        # Kart-bias correction (per team_key mean vs field mean).
        by_team: dict[str, list[float]] = {}
        for s in rated_se:
            by_team.setdefault(s.team_key, []).append(s.avg_lap_ms)
        team_mean = {k: statistics.mean(v) for k, v in by_team.items()}
        field_mean = statistics.mean(s.avg_lap_ms for s in rated_se)
        bias = {k: m - field_mean for k, m in team_mean.items()}

        is_race = (group[0].session_type == "race"
                   and any(s.final_position is not None for s in rated_se))

        field: list[RatedDriver] = []
        for s in rated_se:
            corrected = s.avg_lap_ms - bias.get(s.team_key, 0.0)
            s_corrected = corrected  # stash for the row write below
            field.append(RatedDriver(
                name=s.driver_canonical, team_key=s.team_key,
                corrected_avg_ms=corrected,
                team_position=s.final_position if is_race else None,
            ))

        if is_race:
            key = effective_scores(field, w=0.7)
        else:
            order = sorted(field, key=lambda d: d.corrected_avg_ms)
            n = len(order)
            key = {d.name: (0.0 if n == 1 else i / (n - 1))
                   for i, d in enumerate(order)}

        # Persist SessionResult rows (idempotent on the new unique key) +
        # Glicko-2 dual-track update. COPY the pre-state load / update() /
        # RatingHistory / per-circuit block from the previous
        # _apply_session implementation (git show HEAD~:.../processor.py),
        # substituting the ordering: pairwise score for drivers i,j =
        #   1.0 if key[i] < key[j]; 0.0 if key[i] > key[j];
        #   0.5 if abs(key[i]-key[j]) < 1e-9
        # and writing the new SessionResult columns:
        #   session_seq=seq, session_type=group[0].session_type,
        #   team_mode=group[0].team_mode, duration_s=group[0].duration_s,
        #   effective_score=key[name], final_position=<real pos or None>,
        #   corrected_avg_ms=<corrected>, kart_bias_ms=bias[...],
        #   avg_lap_ms / best_lap_ms / median_lap_ms / total_laps from s.
        applied += 1

    return {"sessions": applied}
```

(c) Update `process_log_file` (lines ~309–353): replace the `parse_log(...)` + `by_session` bucketing with:
```python
    sessions = extract_sessions(str(path), circuit_name=circuit_name, log_date=log_date)
    res = await apply_extracts(sessions, db)
    laps_count = sum(s.total_laps for s in sessions)
    sessions_count = res["sessions"]
```
Keep the existing `ProcessedLog` idempotency check and the final commit/rollback.

(d) Delete the old parser: `git rm backend/app/services/ranking/log_parser.py`.

- [ ] **Step 4: Run integration + full ranking suite**

Run: `.venv/bin/python -m pytest tests/ranking/ -v`
Expected: PASS (all tasks' tests, incl. `test_apply_extracts_populates_global_and_circuit_ratings`).

- [ ] **Step 5: Verify nothing else imported the deleted module**

Run: `grep -rn "log_parser\|parse_log\b\|SessionDriverResult" backend/app | grep -v __pycache__`
Expected: no matches (only `extractor`/`extract_sessions`/`SessionExtract` remain).

- [ ] **Step 6: Commit**

```bash
git add -A backend/app/services/ranking/ backend/tests/ranking/test_extractor.py
git commit -m "feat(ranking): processor consumes SessionExtract; race/pace methodology; drop old parser"
```

---

## Task 7: Chronological global order in `process_pending`

**Files:**
- Modify: `backend/app/services/ranking/processor.py` (`process_pending`, ~356–400)

- [ ] **Step 1: Write failing test**

Append to `backend/tests/ranking/test_methodology.py`:

```python
from app.services.ranking.processor import _ordered_candidates


def test_candidates_sorted_globally_by_date_then_circuit():
    cand = [("RKC_Paris", "2026-05-09"), ("Ariza", "2026-03-28"),
            ("Gensk", "2026-05-02"), ("Ariza", "2026-03-28")]
    assert _ordered_candidates(cand) == [
        ("Ariza", "2026-03-28"), ("Gensk", "2026-05-02"), ("RKC_Paris", "2026-05-09")]
```

- [ ] **Step 2: Run, verify fail**

Run: `.venv/bin/python -m pytest tests/ranking/test_methodology.py::test_candidates_sorted_globally_by_date_then_circuit -v`
Expected: FAIL (`ImportError: cannot import name '_ordered_candidates'`).

- [ ] **Step 3: Implement + wire**

In `processor.py` add:
```python
def _ordered_candidates(candidates: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Global chronological order: oldest log_date first, dedup, circuit
    as tiebreak. Required so the global Glicko rating evolves in true
    time order across circuits (spec §8)."""
    return sorted(set(candidates), key=lambda cd: (cd[1], cd[0]))
```
In `process_pending`, replace whatever ordering it currently uses for the candidate list (the loop that builds `(circuit, log_date)` to process) with `for circuit_name, log_date in _ordered_candidates(candidates):`. Within a log, sessions are already applied in `session_seq` order by `apply_extracts` (it sorts `by_group.items()`).

- [ ] **Step 4: Run, verify pass + suite green**

Run: `.venv/bin/python -m pytest tests/ranking/ -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ranking/processor.py backend/tests/ranking/test_methodology.py
git commit -m "feat(ranking): global chronological processing order across circuits"
```

---

## Task 8: API — remove the 100 cap, expose all drivers

**Files:**
- Modify: `backend/app/api/ranking_routes.py` (`admin_top`, ~71–88)
- Modify: `backend/app/services/ranking/processor.py` (`get_top_drivers`, ~441–500)

- [ ] **Step 1: Write failing test**

Append to `backend/tests/ranking/test_methodology.py`:

```python
import inspect
from app.services.ranking import processor as P
import app.api.ranking_routes as R


def test_no_hard_100_cap():
    # get_top_drivers default must allow "all" (None) and not hardcode 100.
    sig = inspect.signature(P.get_top_drivers)
    assert sig.parameters["limit"].default is None
    src = inspect.getsource(R.admin_top)
    assert "limit: int = 100" not in src
```

- [ ] **Step 2: Run, verify fail**

Run: `.venv/bin/python -m pytest tests/ranking/test_methodology.py::test_no_hard_100_cap -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `processor.py` `get_top_drivers`, change signature `limit: int = 100` → `limit: int | None = None` and make the query apply `.limit(limit)` only when `limit is not None` (both the global and per-circuit query branches). Keep `min_sessions: int = 2`.

In `ranking_routes.py` `admin_top`, change `limit: int = 100` → `limit: int | None = None`, pass it through unchanged. Add `session_type` + `effective_score` to the driver detail payload in `get_driver_detail` (include the new `SessionResult` columns in the per-session list it returns).

- [ ] **Step 4: Run, verify pass + suite**

Run: `.venv/bin/python -m pytest tests/ranking/ -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/ranking_routes.py backend/app/services/ranking/processor.py backend/tests/ranking/test_methodology.py
git commit -m "feat(ranking): remove 100 cap; expose all drivers; surface session_type/effective"
```

---

## Task 9: Isolation regression guard

**Files:**
- Create: `backend/tests/ranking/test_isolation.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/ranking/test_isolation.py`:

```python
"""Contract: the ranking package may only touch app/apex via the two
read-only entrypoints (replay.parse_log_file, parser.ApexMessageParser/
EventType/time_to_ms). It must never import engine/state/live/replay
write paths, and must not modify app/apex."""
import ast
from pathlib import Path

RANKING = Path(__file__).resolve().parents[2] / "app" / "services" / "ranking"
ALLOWED_APEX = {"app.apex.replay", "app.apex.parser"}


def test_ranking_only_imports_allowed_apex_modules():
    bad = []
    for py in RANKING.glob("*.py"):
        tree = ast.parse(py.read_text())
        for node in ast.walk(tree):
            mod = None
            if isinstance(node, ast.ImportFrom) and node.module:
                mod = node.module
            elif isinstance(node, ast.Import):
                for a in node.names:
                    if a.name.startswith("app.apex"):
                        mod = a.name
            if mod and mod.startswith("app.apex") and mod not in ALLOWED_APEX:
                bad.append((py.name, mod))
    assert not bad, f"Disallowed app.apex imports in ranking: {bad}"
```

- [ ] **Step 2: Run, verify pass**

Run: `.venv/bin/python -m pytest tests/ranking/test_isolation.py -v`
Expected: PASS (extractor imports only `app.apex.replay` + `app.apex.parser`).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/ranking/test_isolation.py
git commit -m "test(ranking): isolation guard — only read-only app.apex imports"
```

---

## Task 10: Post-reprocess sanity script + full reprocess runbook

The reprocess endpoints already exist (`POST /admin/ranking/reset` with `{wipe_drivers:false, reprocess:true}` and `POST /admin/ranking/reprocess`). This task adds an observable sanity check and documents the one-off run.

**Files:**
- Create: `backend/scripts/ranking_sanity.py`

- [ ] **Step 1: Write the sanity script**

Create `backend/scripts/ranking_sanity.py`:

```python
"""Post-reprocess sanity metrics. Run inside the backend container:
  python scripts/ranking_sanity.py
Fails (exit 1) if coverage is still pathological."""
import sqlite3
import sys

c = sqlite3.connect("/app/data/boxboxnow.db")
q = lambda s: c.execute(s).fetchone()[0]

processed = q("SELECT COUNT(*) FROM processed_logs")
results = q("SELECT COUNT(*) FROM session_results")
circuits = q("SELECT COUNT(DISTINCT circuit_name) FROM session_results")
sessions = q("SELECT COUNT(*) FROM (SELECT DISTINCT circuit_name,log_date,session_seq FROM session_results)")
circ_ratings = q("SELECT COUNT(*) FROM driver_circuit_ratings")
max_sessions = q("SELECT MAX(sessions_count) FROM driver_ratings")
eupen = q("SELECT COUNT(*) FROM session_results WHERE circuit_name='EUPEN'")

print(f"processed_logs={processed} session_results={results} "
      f"circuits={circuits} distinct_sessions={sessions} "
      f"circuit_ratings={circ_ratings} max_sessions_per_driver={max_sessions} "
      f"eupen_rows={eupen}")

problems = []
if circuits < 12: problems.append(f"only {circuits} circuits (<12)")
if circ_ratings == 0: problems.append("driver_circuit_ratings still empty")
if eupen == 0: problems.append("EUPEN still produces 0 rows")
if max_sessions <= 5: problems.append(f"max_sessions still {max_sessions} (<=5)")
if problems:
    print("SANITY FAIL:", "; ".join(problems)); sys.exit(1)
print("SANITY OK")
```

- [ ] **Step 2: Commit the script**

```bash
git add backend/scripts/ranking_sanity.py
git commit -m "chore(ranking): post-reprocess sanity metrics script"
```

- [ ] **Step 3: Deploy + run the one-off reprocess (runbook — execute, do not automate in code)**

```bash
# from repo root, after the branch is merged/pushed:
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252 \
  "cd /home/ubuntu/boxboxnow-v2 && git pull origin main && docker compose up -d --build"
# trigger reset + full reprocess (chronological, all circuits) via the existing admin endpoint:
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252 \
  "cd /home/ubuntu/boxboxnow-v2 && sudo docker compose exec -T backend \
     python -c \"import asyncio;from app.models.database import async_session;from pathlib import Path;from app.services.ranking.processor import reset_ratings,process_pending;\
import app.tasks.ranking_runner as rr;\
async def go():\
 import app.models.database as d;\
 async with d.async_session() as s:\
  await reset_ratings(s, wipe_drivers=False);\
  await process_pending(s, rr._recordings_dir());\
asyncio.run(go())\""
# sanity:
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252 \
  "cd /home/ubuntu/boxboxnow-v2 && sudo docker compose exec -T backend python scripts/ranking_sanity.py"
```
Expected final line: `SANITY OK`. If `SANITY FAIL`, inspect which circuits still yield 0 (`session_results` per circuit) and feed one of those logs through the Task 1 diagnostic to extend the parser-contract handling in `extractor.py` (new task, repeat TDD).

---

## Self-review

**Spec coverage:**
- §3 architecture (reuse live parser read-only) → Tasks 1,3,9.
- §4 segmentation + classification (titles multi-lang, 20-min gap, 12-min, 40-min endurance) → Tasks 2,3.
- §5 per-driver extraction + real final position + retired + degradation → Task 3 (`_finalize`, `pos_key`, `is_race` fallback in Task 6).
- §6 Glicko methodology (effective w=0.7, n_teams==1 degrade, tie 1e-9, pace path, dual track) → Tasks 4,6.
- §7 data model (new cols, new unique key, recreate) → Task 5; API cap removal + surface fields → Task 8.
- §8 reprocess + global chronological order → Tasks 7,10.
- §9 testing (classifier, extractor both schemas, methodology, isolation, golden via sanity) → Tasks 2,3,4,6,9,10.
- §10 risks (no-positions fallback, retired, idle logs, name normalization) → Task 3/6.

**Placeholder scan:** Task 6 Step 3 intentionally instructs copying the *existing, working* dual-track Glicko block from `git show HEAD~:app/services/ranking/processor.py` rather than re-printing ~120 lines verbatim; the exact substitution (pairwise score rule, new column writes) is specified literally. All other steps contain literal code/commands.

**Type consistency:** `SessionExtract` (Task 3) fields are consumed unchanged in Task 6; `RatedDriver`/`effective_scores` (Task 4) reused in Task 6; `extract_sessions`/`apply_extracts`/`_ordered_candidates`/`get_top_drivers(limit=None)` names consistent across Tasks 3–8.

**Scope:** one cohesive subsystem (ranking extraction+methodology+reprocess); single plan is appropriate.
