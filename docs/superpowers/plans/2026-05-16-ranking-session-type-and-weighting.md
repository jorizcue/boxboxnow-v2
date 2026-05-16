# Ranking Session-Type Rework + 70/30 Weighting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. TDD for all backend tasks (pytest exists via `backend/.venv/bin/python`). NO deploy — commit per task, push at end.

**Goal:** Qualifying/tanda sessions ranked by best lap (not finish order), session type editable from admin (override survives Reset), and tanda sessions move ELO 30% of a race.

**Spec:** `docs/superpowers/specs/2026-05-16-ranking-session-type-and-weighting-design.md`

**Tech:** Python/FastAPI/SQLAlchemy/pytest, TypeScript/React.

**Test runner:** `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests -q`

---

## File Structure

- `backend/app/services/ranking/classifier.py` — add quali keywords.
- `backend/app/models/schemas.py` — new `RankingSessionOverride` model (table auto-created by `Base.metadata.create_all`, database.py:53 — **no migration**, it is a new table not a column add).
- `backend/app/services/ranking/processor.py` — override lookup → effective type; pace ordered by best lap; `SESSION_TYPE_WEIGHT` blend on both Glicko tracks. `reset_ratings` (909) left untouched so overrides survive.
- `backend/app/api/ranking_routes.py` — admin GET/POST/DELETE session-type + reuse reset/reprocess.
- `frontend/src/components/admin/AdminRankingPanel.tsx` — sessions list + Carrera/Tanda toggle + recompute.
- `backend/tests/ranking/` — new tests; `test_race_classification_integration.py` pattern for the headline acceptance.

---

> **Testing-infra note (verified pre-execution):** `backend/tests/ranking/`
> has NO `conftest.py` and NO DB fixture. `test_classifier.py` already exists
> (pure-function). `test_race_classification_integration.py` is DB-free (it
> only calls `extract_sessions` and asserts on `SessionExtract`). Therefore:
> classifier tests EXTEND `test_classifier.py`; pure logic is unit-tested via
> extracted pure helpers; DB-backed tests use a NEW shared
> `backend/tests/ranking/conftest.py` async-sqlite fixture created in Task 2.

## Task 1: Classifier — recognise qualifying

**Files:** `backend/app/services/ranking/classifier.py`; **extend** existing `backend/tests/ranking/test_classifier.py`

- [ ] **Step 1: add failing tests to the END of `backend/tests/ranking/test_classifier.py`** (do not create a new file; keep its existing import `from app.services.ranking.classifier import classify_session, SessionClass`):

```python
from app.services.ranking.classifier import classify_session

def test_spanish_clasificacion_is_pace_even_with_duration_in_title():
    c = classify_session("12H LOS SANTOS", "Clasificación", duration_s=1195, had_driver_swap=False)
    assert c.session_type == "pace"

def test_accentless_and_italian_quali_is_pace():
    assert classify_session("GP", "CLASIFICACION", duration_s=1200, had_driver_swap=False).session_type == "pace"
    assert classify_session("Gara", "Classifica", duration_s=1200, had_driver_swap=False).session_type == "pace"
    assert classify_session("X", "Qualifying", duration_s=1200, had_driver_swap=False).session_type == "pace"

def test_real_race_still_race():
    assert classify_session("12H LOS SANTOS", "CARRERA", duration_s=38803, had_driver_swap=True).session_type == "race"
    assert classify_session("Club", "FINAL", duration_s=900, had_driver_swap=False).session_type == "race"

def test_existing_nonrace_unchanged():
    assert classify_session("X", "ESSAIS LIBRES", duration_s=900, had_driver_swap=False).session_type == "pace"
    assert classify_session("X", "Q1", duration_s=900, had_driver_swap=False).session_type == "pace"
```

- [ ] **Step 2:** Run `cd backend && .venv/bin/python -m pytest tests/ranking/test_classifier_quali.py -q` → FAIL (first test: Clasificación currently → race).

- [ ] **Step 3:** In `classifier.py`, extend the `_NON_RACE` tuple by adding three items: `"CLASIF"`, `"CLASSIFICA"`, `"QUALIF"`. (Matching runs after `_norm` strips accents, so "CLASIFICACIÓN"→"CLASIFICACION" contains "CLASIF". Precedence already correct: `if has_non_race` is checked before `elif has_race`.) No other change.

- [ ] **Step 4:** Re-run → all pass. Then `cd backend && .venv/bin/python -m pytest tests/ranking -q` → all pass (no regression).

- [ ] **Step 5: commit**
```bash
cd /Users/jizcue/boxboxnow-v2 && git add backend/app/services/ranking/classifier.py backend/tests/ranking/test_classifier.py && git commit -m "fix(ranking): classify Spanish/Italian qualifying as pace (Clasificación no longer race)"
```

---

## Task 2: `RankingSessionOverride` model (survives Reset)

**Files:** `backend/app/models/schemas.py`; NEW `backend/tests/ranking/conftest.py`; test `backend/tests/ranking/test_session_override_model.py`

- [ ] **Step 0: create the shared async DB fixture** `backend/tests/ranking/conftest.py` (none exists; this is reused by Tasks 2/5/7). In-memory SQLite via the project's async stack:

```python
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models.schemas import Base

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()
```

Confirm `pytest_asyncio` + `aiosqlite` are available in `backend/.venv` (the app already uses async SQLAlchemy; if `pytest.ini`/`pyproject` lacks `asyncio_mode=auto`, mark async tests with `@pytest.mark.asyncio`). Verify imports by running one trivial async test.

- [ ] **Step 1: failing test**:

```python
import pytest
from sqlalchemy import select
from app.models.schemas import RankingSessionOverride, SessionResult
from app.services.ranking.processor import reset_ratings

@pytest.mark.asyncio
async def test_override_row_roundtrip_and_survives_reset(db_session):
    db = db_session
    db.add(RankingSessionOverride(circuit_name="Santos", log_date="2026-04-25",
                                  session_seq=1, forced_type="pace",
                                  title1="12H LOS SANTOS", title2="Clasificación"))
    await db.flush()
    await reset_ratings(db, wipe_drivers=False)
    rows = (await db.execute(select(RankingSessionOverride))).scalars().all()
    assert len(rows) == 1 and rows[0].forced_type == "pace"
```

(Use the existing async DB fixture from `backend/tests/ranking/conftest.py`; if the fixture name differs, match it — inspect conftest first.)

- [ ] **Step 2:** Run → FAIL (`ImportError: RankingSessionOverride`).

- [ ] **Step 3:** Add to `schemas.py` next to `SessionResult`:

```python
class RankingSessionOverride(Base):
    """Admin-forced session type for a recorded session. Consulted by
    apply_extracts (effective type = override ?? classifier). Lives in
    its own table so reset_ratings (which truncates session_results /
    rating_history / processed_logs) does NOT wipe manual fixes."""
    __tablename__ = "ranking_session_overrides"

    id = Column(Integer, primary_key=True, autoincrement=True)
    circuit_name = Column(String(64), nullable=False, index=True)
    log_date = Column(String(10), nullable=False, index=True)
    session_seq = Column(Integer, nullable=False)
    forced_type = Column(String(8), nullable=False)  # "race" | "pace"
    title1 = Column(String(120), default="", nullable=False)
    title2 = Column(String(120), default="", nullable=False)
    updated_at = Column(DateTime, server_default=func.now(),
                        onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("circuit_name", "log_date", "session_seq",
                         name="uq_ranking_session_override"),
    )
```

(Verify `DateTime`, `func`, `UniqueConstraint`, `Column`, `String`, `Integer` are already imported in schemas.py — they are, SessionResult uses them.) The table is created on startup by `Base.metadata.create_all` (database.py:53); confirm `reset_ratings` (processor.py:909-929) has NO `delete(RankingSessionOverride)` — it must not.

- [ ] **Step 4:** Run → pass. Then `pytest tests/ranking -q` → all pass.

- [ ] **Step 5: commit**
```bash
git add backend/app/models/schemas.py backend/tests/ranking/test_session_override_model.py && git commit -m "feat(ranking): RankingSessionOverride table (survives reset_ratings)"
```

---

## Task 3: Effective type (override) + pace ordered by best lap

**Files:** `backend/app/services/ranking/processor.py`; test `backend/tests/ranking/test_pace_ordering.py`

Context: in `apply_extracts`, each `agg_group` is one session. Currently
`is_race = agg_group[0].session_type=="race" and any(final_position)`; pace
path sorts `field` by `corrected_avg_ms`; `SessionResult.final_position` =
`s.final_position if is_race else None`; `session_type=agg_group[0].session_type`.

- [ ] **Step 1: failing tests** `test_pace_ordering.py`. Two layers:
  - **Pure unit (no DB)** on a new pure helper `_pace_positions(rated_se) -> dict[str, int]` (added in Step 3): given SessionExtract-like rows with `team_key`/`best_lap_ms`, fastest team-best → position 1, ties stable, no-best-lap excluded. This is the core ordering logic, DB-free.
  - **DB (uses `db_session` from conftest)**: a synthetic pace `agg_group` through `apply_extracts`; assert persisted `SessionResult.final_position` == best-lap rank and race group still finish-order; insert `RankingSessionOverride(forced_type="pace")` for a classifier-"race" group and assert it is treated as pace (positions by best lap, `session_type` stored "pace"). Mirror SessionExtract construction from `tests/ranking/test_results.py` / `test_race_classification_integration.py`.

- [ ] **Step 2:** Run → FAIL (pace currently stores `final_position=None` / orders by avg).

- [ ] **Step 3:** Implement in `processor.apply_extracts`:
  1. Right after the `agg_group` is formed and BEFORE `is_race` is computed, look up an override and derive the effective type/mode:
  ```python
  ov = (await db.execute(
      select(RankingSessionOverride).where(
          RankingSessionOverride.circuit_name == circuit_name,
          RankingSessionOverride.log_date == log_date,
          RankingSessionOverride.session_seq == session_seq,
      )
  )).scalar_one_or_none()
  effective_type = ov.forced_type if ov else agg_group[0].session_type
  effective_mode = ("individual" if effective_type == "pace"
                    else agg_group[0].team_mode)
  ```
  2. Replace every `agg_group[0].session_type` used for rating/persist with `effective_type`, and `agg_group[0].team_mode` with `effective_mode` (the `is_race` line, the `SessionResult(session_type=..., team_mode=...)` kwargs).
  3. `is_race = effective_type == "race" and any(s.final_position is not None for s in rated_se)`.
  4. Add a **pure module-level helper** to `processor.py` (unit-tested DB-free in Task 3 Step 1):
  ```python
  def _pace_positions(rated_se: list) -> dict[str, int]:
      """team_key -> 1-based rank by the competitor's best lap
      (min best_lap_ms over its rows). Competitors with no valid
      best lap are omitted (caller pushes them last)."""
      comp_best: dict[str, int] = {}
      for s in rated_se:
          if s.best_lap_ms and s.best_lap_ms > 0:
              prev = comp_best.get(s.team_key)
              comp_best[s.team_key] = (s.best_lap_ms if prev is None
                                       else min(prev, s.best_lap_ms))
      ranked = sorted(comp_best, key=comp_best.__getitem__)
      return {tk: i + 1 for i, tk in enumerate(ranked)}
  ```
  Pace branch (the `else:` that currently sorts `field` by `corrected_avg_ms`) becomes:
  ```python
  pace_pos = _pace_positions(rated_se)
  n = len(pace_pos)
  key = {}
  for d in field:
      p = pace_pos.get(d.team_key)
      if p is None:                       # no valid best lap → last
          key[d.name] = 1.0 if n > 1 else 0.0
      else:
          key[d.name] = 0.0 if n <= 1 else (p - 1) / (n - 1)
  ```
  5. Persist position for pace too — change the `SessionResult(... final_position=(s.final_position if is_race else None) ...)` to:
  ```python
  final_position=(s.final_position if is_race
                  else pace_pos.get(s.team_key)),
  ```
  Keep race path (`is_race` True → `effective_scores(field, w=0.7)`) exactly as is.

- [ ] **Step 4:** Run the new test → pass. Then `pytest tests/ranking -q` → all pass.

- [ ] **Step 5: commit**
```bash
git add backend/app/services/ranking/processor.py backend/tests/ranking/test_pace_ordering.py && git commit -m "feat(ranking): effective type via override + pace ranked by best lap"
```

---

## Task 4: 70/30 race/pace Glicko-2 weighting

**Files:** `backend/app/services/ranking/processor.py`; test `backend/tests/ranking/test_session_type_weight.py`

- [ ] **Step 1: failing tests (pure, DB-free)** `test_session_type_weight.py` on the pure helper `_blend` + the constants:
  - `SESSION_TYPE_WEIGHT == {"race": 1.0, "pace": 0.3}` and `INTRA_RACE_POS_WEIGHT == 0.7`.
  - `_blend(pre, new, 1.0) == new` (race is byte-identical).
  - `_blend(pre, new, 0.0) == pre`.
  - Linear identity: for arbitrary `pre`/`new` `Glicko2State`s, `_blend(pre,new,0.3).rating - pre.rating == 0.3*(new.rating - pre.rating)` (and same for `rd`, `volatility`), tol 1e-9.
  End-to-end weighting (a real session moving 30%) is covered by the Task 7 integration test — keep Task 4 DB-free.

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** In `processor.py`:
  - Add module constants near `MIN_DRIVERS_PER_SESSION`:
  ```python
  # Intra-RACE blend (position vs kart-corrected pace) — UNCHANGED.
  INTRA_RACE_POS_WEIGHT = 0.7
  # Inter-session-type weight on the Glicko-2 move: a tanda moves the
  # rating 30% of what an equivalent race would. Tunable.
  SESSION_TYPE_WEIGHT = {"race": 1.0, "pace": 0.3}
  ```
  Replace the literal `effective_scores(field, w=0.7)` call with `effective_scores(field, w=INTRA_RACE_POS_WEIGHT)` (pure rename, no behaviour change).
  - Add a helper:
  ```python
  def _blend(pre: Glicko2State, new: Glicko2State, w: float) -> Glicko2State:
      """Move only `w` of the way from pre→new (w=1 → new; w=0 → pre)."""
      return Glicko2State(
          rating=pre.rating + w * (new.rating - pre.rating),
          rd=pre.rd + w * (new.rd - pre.rd),
          volatility=pre.volatility + w * (new.volatility - pre.volatility),
      )
  ```
  - In the per-driver loop, set `w = SESSION_TYPE_WEIGHT.get(effective_type, 1.0)`. Wrap BOTH track updates: replace `new_global = update(pre_global[drv_i.id], global_opps)` with `new_global = _blend(pre_global[drv_i.id], update(pre_global[drv_i.id], global_opps), w)` and the analogous per-circuit `new_circuit = _blend(pre_circuit[drv_i.id], update(pre_circuit[drv_i.id], circuit_opps), w)`. Everything downstream (writing `grow.rating/rd/volatility`, `RatingHistory.delta = new.rating - prev`) then uses the blended state unchanged. Read processor.py lines 487-545 to wire both tracks identically.

- [ ] **Step 4:** Run new test → pass. `pytest tests/ranking -q` → all pass.

- [ ] **Step 5: commit**
```bash
git add backend/app/services/ranking/processor.py backend/tests/ranking/test_session_type_weight.py && git commit -m "feat(ranking): 70/30 race/pace weighting on Glicko-2 (tanda moves rating 30%)"
```

---

## Task 5: Admin API — list sessions + set/clear override

**Files:** `backend/app/api/ranking_routes.py`; test `backend/tests/ranking/test_admin_session_type_api.py`

- [ ] **Step 1: failing test** using the app's async test client + an admin auth dependency override (mirror how existing admin-ranking endpoint tests authenticate — inspect any `tests/` that hit `/api/admin/ranking`; if none, use the FastAPI dependency-override pattern for the admin guard used by `admin_reset`). Assert: `POST /api/admin/ranking/session-type` upserts a row; `GET /api/admin/ranking/sessions` returns the session with `forced_type`; `DELETE` removes it.

- [ ] **Step 2:** Run → FAIL (404).

- [ ] **Step 3:** In `ranking_routes.py` on `admin_router` (prefix `/api/admin/ranking`, same admin guard dependency as `admin_reset` at line 175):
  - `GET /sessions`: `SELECT DISTINCT circuit_name, log_date, session_seq, title1, title2, session_type, team_mode, COUNT(driver_id)` from `SessionResult` grouped by the 5 identity cols; left-join `RankingSessionOverride` to include `forced_type`. Return list ordered by `log_date desc, circuit_name, session_seq`.
  - `POST /session-type` body `{circuit_name, log_date, session_seq, forced_type}` (`forced_type ∈ {"race","pace"}`, 422 otherwise): upsert `RankingSessionOverride` (snapshot title1/title2 from the matching SessionResult if present).
  - `DELETE /session-type` body or query `{circuit_name, log_date, session_seq}`: delete the override row (idempotent).
  Use the existing Pydantic-model + `get_db` + admin-guard conventions already in this file (read the top of the file + `admin_reset` for the exact dependency names).

- [ ] **Step 4:** Run → pass; `pytest tests/ranking -q` → all pass.

- [ ] **Step 5: commit**
```bash
git add backend/app/api/ranking_routes.py backend/tests/ranking/test_admin_session_type_api.py && git commit -m "feat(ranking): admin API to list sessions + override session type"
```

---

## Task 6: Frontend — session-type editor in AdminRankingPanel

**Files:** `frontend/src/components/admin/AdminRankingPanel.tsx` (+ i18n if the panel uses keyed strings; match existing pattern in the file)

- [ ] **Step 1:** Read `AdminRankingPanel.tsx` fully to learn its data-fetch helper, auth header, styling, and where the existing reset/recompute control lives.
- [ ] **Step 2:** Add a "Tipo de sesión" section: fetch `GET /api/admin/ranking/sessions`; render a table (circuit · fecha · sesión · título · tipo actual · nº pilotos) with a **Carrera / Tanda** toggle per row. Changing it → `POST /api/admin/ranking/session-type`; a "revertir a automático" → `DELETE`. Show the effective type = override ?? classified. Reuse the panel's existing fetch/error/loading and button styles (no new design system).
- [ ] **Step 3:** Add/confirm a "Recalcular ranking" button that calls the existing reset+reprocess admin action, with an explicit warning ("operación pesada; los overrides se conservan"). If the panel already has the reset control, just add the warning copy about overrides; do not duplicate it.
- [ ] **Step 4: verify**
```bash
cd /Users/jizcue/boxboxnow-v2/frontend && npx tsc --noEmit 2>&1 | tail -15 && npm run build 2>&1 | tail -12
```
Both must succeed.
- [ ] **Step 5: commit**
```bash
git add frontend/src/components/admin/AdminRankingPanel.tsx && git commit -m "feat(ranking): admin UI to edit session type (Carrera/Tanda)"
```

---

## Task 7: Headline acceptance (real Santos fixture) + full suite

**Files:** `backend/tests/ranking/test_session_type_integration.py`

- [ ] **Step 1:** New `test_session_type_integration.py` on the committed fixture
`backend/tests/ranking/fixtures/santos_2026-04-25.log.gz`, two parts:
  - **Part A — extractor (DB-free, mirror `test_race_classification_integration.py`'s `@pytest.mark.skipif(not os.path.exists(SANTOS))` + `extract_sessions` style):** `extract_sessions(SANTOS, circuit_name="Santos", log_date="2026-04-25")`, group by `session_seq`; assert seq=1 (`title2` ~ "Clasificación") → `session_type == "pace"` (classifier fix proven end-to-end on real data); seq=2 & seq=3 ("CARRERA") → `"race"`.
  - **Part B — apply_extracts (uses `db_session` from conftest):** run `apply_extracts(extract_sessions(...), db)`; query `SessionResult` for circuit Santos / 2026-04-25 / seq=1 / the **kart 8** row(s) (Jon del Valle); assert `final_position == 3` (real data: team-best 1:04.532 = 3rd-fastest, behind kart 3 @64510 and kart 10 @64523) and stored `session_type == "pace"`; assert a seq=2 row keeps a finish-order `final_position` with `session_type == "race"`. Then insert `RankingSessionOverride(circuit_name="Santos", log_date="2026-04-25", session_seq=1, forced_type="race")`, `reset_ratings(db)` (must NOT delete the override), re-run `apply_extracts`, and assert seq=1 rows now have `session_type == "race"` with finish-order positions (kart 8 back near last) — proving override + survives-reset end-to-end.
- [ ] **Step 2:** Run it → pass.
- [ ] **Step 3:** Full suite: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests -q` → all pass. Also re-run `npx tsc --noEmit && npm run build` in `frontend` → green.
- [ ] **Step 4: commit**
```bash
git add backend/tests/ranking/test_session_type_integration.py && git commit -m "test(ranking): Santos Clasificación → pace, Jon del Valle P3 by best lap (acceptance)"
```

---

## Self-Review

- **Spec coverage:** A classifier (T1) ✔; B override table + survives reset (T2) ✔; B effective-type lookup (T3) ✔; C pace-by-best-lap incl. persisted final_position (T3) ✔; D 70/30 weighting both tracks (T4) ✔; E admin API (T5) + frontend (T6) ✔; F recompute via existing reset/reprocess, no partial (T5 step3 reuses it) ✔; acceptance on real data (T7) ✔.
- **Placeholders:** none — keywords, model columns, exact code blocks, formulas, endpoints, pytest/tsc/build commands, and the data-verified P3 assertion are concrete. Soft spots are explicitly bounded with "inspect existing pattern" instructions (conftest fixture name, admin-guard dependency name, AdminRankingPanel internals) — these require reading the current file, not inventing.
- **Type consistency:** `RankingSessionOverride` fields used identically in schemas/processor/API/tests; `effective_type` (str "race"|"pace") drives `is_race`, persisted `session_type`, `pace_pos`, and `SESSION_TYPE_WEIGHT[effective_type]`; `_blend` applied to both Glicko tracks; `forced_type` constrained to {race,pace} at the API and modelled as String(8).
- **Regression safety:** race path math untouched (`w=1.0`; `effective_scores` only renamed via constant); `reset_ratings` deliberately not modified; new table auto-created by `create_all`.

## Execution Handoff

Execute with **superpowers:subagent-driven-development** on `main` (user's standing workflow), TDD per task, spec-compliance then code-quality review between tasks. After Task 7: full backend suite + web build green, every task committed → **push `origin/main`, DO NOT deploy** (explicit standing instruction; the operator will deploy + run the override-aware recompute when ready).
