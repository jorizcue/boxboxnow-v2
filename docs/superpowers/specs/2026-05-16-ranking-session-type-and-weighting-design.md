# Ranking: Session-Type Classification, Pace-by-Best-Lap, Editable Type & Race/Pace Weighting — Design

**Date:** 2026-05-16
**Status:** Approved direction (Jorizcue: "haría el paquete completo", 70/30 confirmed)
**Spec reviewed inline; implementation gated to commit+push, NO deploy until user says.**

## Problem (empirically proven on real data)

Santos `2026-04-25`, session `seq=1 "12H LOS SANTOS / Clasificación"`:
`classify_session` sees `_DURATION_RE` match "12H" → `has_race=True`; `_NON_RACE`
has "QUALI" but **not** "CLASIF" → `has_non_race=False` → `session_type="race"`.
Consequently `results.py` orders by `(retired, -laps, time)` and **Jon del Valle
(kart 8) is P18/18** despite the **3rd-fastest lap of the field** (1:04.532;
only KTA 1:04.510 and CREATIA 1:04.523 quicker). Because `processor.is_race`
becomes True, that bogus P18 enters Glicko-2 (blended w=0.7 with pace) and
**corrupts his rating**. The entire grid is scrambled (lap-count dominates a
20-min quali).

Two root causes, both verified:
1. **Classifier**: Spanish "Clasificación" not recognised; the duration
   heuristic wrongly wins.
2. **Ordering**: `results.py:139` orders by finish **regardless of
   `session_type`** — pace sessions are never ordered by best lap.

## What already exists (do NOT rebuild)

- `session_results` table = per-(session,driver) materialised store with
  `session_type` (race|pace), `final_position`, `best_lap_ms`, independent of
  the live ratings. "Reset" truncates `processed_logs`+`session_results`+
  `rating_history` and recomputes ratings from recordings → results ARE already
  decoupled from the ELO layer.
- `processor.apply_extracts` already branches: race → `effective_scores`
  (final position blended **w=0.7** with kart-bias-corrected pace); pace →
  rank by corrected average lap.
- `glicko2.update(state, opponents) -> Glicko2State` is a pure function.

## Goal — the full package

1. **Classifier fix**: recognise qualifying ("Clasificación", "Classifica",
   "Qualif…") and let explicit non-race beat the duration heuristic.
2. **Pace ordered by best lap**: for effective `pace`, `final_position` AND the
   Glicko ordering key are derived from **best lap ascending** (the user's
   "ordenar por el tiempo de mejor vuelta"), per competitor (kart for
   endurance, driver otherwise). Race path unchanged.
3. **Editable session type from the frontend**: an admin override that
   **survives Reset** and is consulted by the pipeline. Effective type =
   `override ?? classified`.
4. **Race/pace rating weight (70/30)**: a tanda moves the ELO **30%** of what
   an equivalent race would; a race moves it 100% (unchanged). Tunable.

Non-goals: changing the intra-race position/pace blend (the existing `w=0.7`
stays); partial/targeted recompute (Glicko-2 is path-dependent → full replay
only); auto-detecting more types beyond the keyword add.

## Design

### A. Classifier (`backend/app/services/ranking/classifier.py`)

Add to `_NON_RACE` (matched after `_norm` strips accents, so
"CLASIFICACIÓN"→"CLASIFICACION"): `"CLASIF"`, `"CLASSIFICA"`, `"QUALIF"`.
(`"QUALI"` already covers QUALIFYING/QUALIFICATION as a substring; the real gap
is Spanish CLASIF*/Italian CLASSIFICA*.) Precedence is already correct —
`if has_non_race: "pace"` is checked **before** `elif has_race` (line 49-54),
so "12H LOS SANTOS CLASIFICACION" → `has_non_race=True` → `pace`. No precedence
change needed. `team_mode` stays "individual" for pace (it already gates
endurance on `session_type=="race"`).

Accepted edge: a qualifying *heat* literally named so will be treated as pace —
matches the user's explicit intent ("una clasificación se ordena por mejor
vuelta").

### B. Effective session type = override ?? classified

New table **`ranking_session_overrides`** (`schemas.py` + migration mirroring
the `apex_last_position` migration):

| column | type | notes |
|---|---|---|
| id | int pk | |
| circuit_name | str(64) | part of natural key |
| log_date | str(10) | YYYY-MM-DD |
| session_seq | int | |
| forced_type | str(8) | "race" \| "pace" |
| title1, title2 | str(120) | snapshot for the admin list display |
| updated_at | datetime | |
| | | `UniqueConstraint(circuit_name, log_date, session_seq)` |

- **`reset_ratings` MUST NOT truncate this table** (it only wipes
  `processed_logs`+`session_results`+`rating_history`). Verify in
  `processor.reset_ratings`.
- In `apply_extracts`, per `(circuit_name, log_date, session_seq)` group, look
  up an override; if present, set the group's effective `session_type`
  (and recompute `team_mode`: pace→"individual"). One query per group
  (negligible — groups are few per log).

### C. Pace ordered by best lap (`processor.apply_extracts`)

The effective-type decision and the override both live in `apply_extracts`, so
the pace ordering is computed there (single source of truth), **not** in
`results.py` (which keeps emitting finish-order `final_position` + `best_lap_ms`
for the race path — unchanged, no regression risk to races).

For effective `pace`:
- Competitor = `team_key` (already kart for endurance, row otherwise).
- `competitor_best = min(s.best_lap_ms for s in group rows with that team_key
  and best_lap_ms > 0)`.
- Rank competitors by `competitor_best` ascending → `final_position` per
  competitor (shared across its drivers, mirroring the race endurance rule).
  Competitors with no valid best lap sort last (after the existing
  `MIN_LAPS_PER_DRIVER`/`laps_floor` filter already removes out/in-lap-only
  drivers).
- The Glicko ordering `key` for pace becomes the normalised best-lap rank
  (replacing the current corrected-average-lap ordering). Rationale: the user
  explicitly wants tanda strength judged by **best lap**, and best lap is far
  less kart-bias-sensitive than average, so kart-bias correction is dropped on
  the pace path (documented simplification; race path keeps it).
- Persist `final_position` (best-lap rank) on `SessionResult` for pace too, so
  the driver-detail "Últimas sesiones" shows the correct qualifying order.

Race path: `is_race = effective_type=="race" and any(final_position)` →
unchanged `effective_scores(field, w=0.7)`.

### D. Race/pace weighting (70/30)

Module constant in `processor.py`:
`SESSION_TYPE_WEIGHT = {"race": 1.0, "pace": 0.3}` (tunable; documented).

After computing the per-track Glicko result, blend toward the pre-state by the
effective-type weight `w`, **per component**, for BOTH the global and the
per-circuit update:

```
new      = update(pre, opps)              # existing call, unchanged
w        = SESSION_TYPE_WEIGHT[effective_type]
eff      = Glicko2State(
    rating     = pre.rating     + w*(new.rating     - pre.rating),
    rd         = pre.rd         + w*(new.rd         - pre.rd),
    volatility = pre.volatility + w*(new.volatility - pre.volatility),
)
```

`eff` is what gets written to `DriverRating`/`DriverCircuitRating` and what
`RatingHistory.delta` records. `w=1.0` for race → **byte-identical** to current
behaviour for race-only drivers (regression-safe). Blending RD/volatility by
the same `w` is intentional: a low-information tanda should also grant
proportionally less confidence (RD shrinks 30% as much). The intra-race
`effective_scores(w=0.7)` blend is **independent** and unchanged; the spec/code
will name them distinctly (`INTRA_RACE_POS_WEIGHT` vs `SESSION_TYPE_WEIGHT`) to
prevent the conceptual conflation the user flagged.

### E. Admin API + frontend editor

Backend (`backend/app/api/ranking_routes.py`, `admin_router`
`/api/admin/ranking`):
- `GET /api/admin/ranking/sessions` → distinct sessions from `session_results`
  (`circuit_name, log_date, session_seq, title1, title2`, classified type,
  override if any, driver count). For the editor list.
- `POST /api/admin/ranking/session-type` body
  `{circuit_name, log_date, session_seq, forced_type}` → upsert
  `ranking_session_overrides`. `forced_type ∈ {race,pace}`.
- `DELETE /api/admin/ranking/session-type/{...}` → remove override (revert to
  auto classification).
- Recompute = the **existing** reset+reprocess path (now override-aware). The
  existing `admin_reset` (ranking_routes.py:175 → `reset_ratings`) is reused;
  add/confirm a "reprocess all recordings" trigger (the daily `_run_once` in
  `ranking_runner.py`) is invocable from admin. No new partial-recompute logic
  (Glicko-2 is path-dependent; only full replay is correct).

Frontend (`frontend/src/components/admin/AdminRankingPanel.tsx`):
- A sessions table (grouped by circuit/date) with the classified type, an
  override toggle **Carrera / Tanda** per session, save → POST; clear → DELETE.
- A "Recalcular ranking" action (reset + reprocess) with an explicit heavy-op
  warning and a note that overrides are preserved.
- Auth: admin-only, same guard as the existing admin ranking actions.

### F. Recompute / operational note

Editing a type only persists the override. Applying it requires the full
reset+reprocess (overrides preserved, classifier+pace+weighting applied). This
is the same "Reset completo" the operator already runs; documented in the admin
UI. **No deploy is performed by this work** — the operator deploys and runs the
recompute when ready.

## Data Flow

recordings → `extract_sessions` (classifier with new keywords) → per-group in
`apply_extracts`: effective_type = `ranking_session_overrides` ?? classified →
race: finish-order `final_position` + `effective_scores(w=0.7)`; pace: best-lap
rank `final_position` + best-lap key → Glicko-2 `update()` → blend by
`SESSION_TYPE_WEIGHT[effective_type]` → `DriverRating`/`DriverCircuitRating` +
`RatingHistory`; `SessionResult` persisted with effective type & position.

## Backwards Compatibility

- Race-only drivers: `w=1.0` and unchanged race ordering → ratings byte-
  identical after recompute.
- Additive table; `reset_ratings` explicitly preserves it.
- Old behaviour for pace changes intentionally (best-lap order + 0.3 weight) —
  this is the requested fix; takes effect only after the operator's recompute.

## Testing (backend pytest; web build)

- **classifier** (`tests/ranking`): "12H LOS SANTOS / Clasificación"→pace;
  "12H LOS SANTOS / CARRERA"→race; accentless + Italian "Classifica"→pace;
  existing "ESSAIS"/"Q1"/plain "CARRERA"/"FINAL" unchanged.
- **pace ordering** (synthetic): pace group → `final_position` == best-lap rank
  (endurance shares per kart); race group unchanged.
- **override**: forced_type wins over classifier; `reset_ratings` leaves
  `ranking_session_overrides` intact.
- **weighting**: identical pairwise outcomes — pace rating delta ≈ 0.30 × race
  delta; race delta unchanged vs pre-change baseline.
- **integration (headline acceptance, real fixture
  `tests/ranking/fixtures/santos_2026-04-25.log.gz`)**: seq=1 effective type
  == pace; Jon del Valle (kart 8) `final_position == 3`; seq=2/3 "CARRERA"
  still race. Mirrors the existing dryrun-gate pattern.
- `npx tsc --noEmit` + `npm run build` green for the admin UI.

## Scope

One cohesive feature → one implementation plan, tasks: (1) classifier +
tests; (2) override table + migration + reset-preservation; (3) pace-by-best-
lap ordering in apply_extracts + tests; (4) 70/30 weighting + tests;
(5) admin API; (6) admin frontend; (7) integration acceptance test + full
suite + web build. Commit per task; push at end; **no deploy**.
