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

## Task 1: Classifier — recognise qualifying

**Files:** `backend/app/services/ranking/classifier.py`; test `backend/tests/ranking/test_classifier_quali.py`

- [ ] **Step 1: failing test** `backend/tests/ranking/test_classifier_quali.py`:

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
cd /Users/jizcue/boxboxnow-v2 && git add backend/app/services/ranking/classifier.py backend/tests/ranking/test_classifier_quali.py && git commit -m "fix(ranking): classify Spanish/Italian qualifying as pace (Clasificación no longer race)"
```

---

## Task 2: `RankingSessionOverride` model (survives Reset)

**Files:** `backend/app/models/schemas.py`; test `backend/tests/ranking/test_session_override_model.py`

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

- [ ] **Step 1: failing test** `test_pace_ordering.py` — build a synthetic pace `agg_group` (3 individual competitors, distinct `best_lap_ms`, similar avg) through `apply_extracts` with a fresh `db_session`; assert the persisted `SessionResult.final_position` equals the **best-lap** rank (fastest best_lap → position 1), and that a race group still ranks by finish. Also: insert a `RankingSessionOverride(forced_type="pace")` for a group the classifier calls "race" and assert that group is treated as pace (final_position by best lap, session_type stored "pace"). (Mirror the construction style of the existing `tests/ranking/test_race_classification_integration.py`; reuse its `SessionExtract` builders/helpers if present.)

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
  4. Pace branch: rank competitors by best lap. Add, in the `else:` (pace) branch that currently sorts by `corrected_avg_ms`:
  ```python
  comp_best: dict[str, int] = {}
  for s in rated_se:
      if s.best_lap_ms and s.best_lap_ms > 0:
          comp_best[s.team_key] = min(
              comp_best.get(s.team_key, s.best_lap_ms), s.best_lap_ms)
  ranked_comps = sorted(comp_best, key=comp_best.__getitem__)
  pace_pos = {tk: i + 1 for i, tk in enumerate(ranked_comps)}
  n = len(ranked_comps)
  # ordering key: normalised best-lap rank (lower = better)
  key = {}
  for d in field:
      p = pace_pos.get(d.team_key)
      key[d.name] = 0.0 if (p is None or n <= 1) else (p - 1) / (n - 1)
  ```
  (Competitors with no valid best lap → not in `pace_pos`; they keep key 0.0 only if alone, otherwise they were already filtered by the `laps_floor`/`MIN_LAPS` gate; if any remain with no best lap, push them last: set their key to `1.0`. Add: `if p is None and n > 1: key[d.name] = 1.0`.)
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

- [ ] **Step 1: failing test**: two identical synthetic sessions (same drivers, same pairwise outcomes) processed from the same fresh ratings — one effective `race`, one effective `pace`. Assert: race produces the pre-change baseline delta; pace produces ≈ `0.30 ×` the race delta on `DriverRating.rating` (tolerance 1e-6 on the linear-blend identity), and `RatingHistory.delta` matches the blended value. Assert race path rating equals what it was before this task (regression: capture via a `race` run).

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

- [ ] **Step 1:** New test using the committed fixture
`backend/tests/ranking/fixtures/santos_2026-04-25.log.gz` (mirror
`test_race_classification_integration.py`): run `extract_sessions` →
`apply_extracts` end-to-end against a fresh `db_session`. Assert, on
`seq=1 "12H LOS SANTOS / Clasificación"`:
  - effective `session_type == "pace"` (classifier fix);
  - the `SessionResult` for **Jon del Valle, kart 8** has `final_position == 3`
    (verified from real data: team-best 1:04.532 = 3rd-fastest, behind kart 3
    @64510 and kart 10 @64523);
  - `seq=2` and `seq=3` ("12H LOS SANTOS / CARRERA") remain `session_type ==
    "race"` with finish-order positions.
  Then with a `RankingSessionOverride(seq=1, forced_type="race")` inserted,
  re-run and assert seq=1 is treated as race (positions revert to finish
  order) — proving the override path end-to-end.
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
