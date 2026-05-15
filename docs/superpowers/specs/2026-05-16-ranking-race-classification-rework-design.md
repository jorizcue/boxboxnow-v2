# Ranking — Race Classification Rework (session windowing + reconstructed finishing order + team ELO)

> Design doc. Status: APPROVED by user 2026-05-16. Next step: implementation plan (superpowers:writing-plans).

## Goal

Make the `final_position` that feeds the Glicko‑2 ELO equal the **real race finishing classification**, reconstructed from lap data, with sessions correctly delimited, and endurance ELO computed on the **team (kart) result shared by all its drivers**. A wrong implementation followed by the admin "Reset completo" recomputes **every** rating, so correctness and fixture-verified behaviour are the overriding constraints.

## Background / Diagnosis (evidence)

Investigated the live ranking pipeline (`backend/app/services/ranking/extractor.py` → `processor.py`) and replayed real production recordings. Three distinct root causes, all in `extractor.py`'s session handling:

1. **Session over-merge.** `extract_sessions` opens/closes a "session" only on title change (`CATEGORY`/`SESSION_TITLE`) or a >20 min lap gap. Apex reuses the **same title** for consecutive on-track runs. Evidence — Ariza `2026-05-02.log.gz`, "HEAT B-C" window 10:50:54→11:09:13 (~18 min), several karts with **26 laps** (≈2 races of 13). `final_position` ends up = the standing at the end of the *last* merged sub-run; laps double.

2. **Position == alphabetical grid order in short/superpole sub-runs.** Apex pushes an `INIT value="init"` grid (rows ordered alphabetically by name) and, in 1-lap superpoles or right after a grid reset, the live `rk`/RANKING never updates. The last RANKING captured is the alphabetical start list. Evidence — "SUPERHEAT A" final positions 1..20 = ABRAHAN, ADRIAN, ADRIAN, ALBERTO, ANETTE, BORIS, DANIEL, … and **Jon del Valle is always ~9th because "JON" is 9th alphabetically**, despite winning. (Largely a *symptom of #1*: a properly bounded heat DOES have live position movement — verified kart 25 RANKING 2,1,2,1,2 during real racing.)

3. **race_log_split on long races (issue #7).** The inverse: a single long race captured as multiple `session_seq` because a mid-race Apex reconnect emits a fresh `INIT init`. Evidence — Santos `2026-04-25` "12H LOS SANTOS" stored as seq 1 (Clasificación), seq 2 (~526–560 laps, full 12 h, kart 9 team_name "ANTONIO ARRANZ" pos 11), seq 3 (~49–59 laps fragment, kart 9 "KARTINGNOW ENDURANCE" Jorge Izcue pos 7, the only row he gets ELO from: 1536.8→1597.0, +60.2). Team really finished 13th.

**The unifying truth:** the authoritative session boundary in the raw Apex stream is the `INIT value="init"` grid reset (a fresh contiguous block of row_ids; usually preceded by a chequered flag and followed by lights/duration), **not** the title. Both over-merge (#1/#2) and false-split (#3) are *wrong session windowing*. Apex's `rk`/RANKING column is not a reliable result source; the lap data is.

## Locked decisions (from brainstorming)

- **Scope:** integral — fix all three.
- **Unreliable/any classification:** **reconstruct** the finishing order from lap data (laps completed, then cumulative race time); do **not** trust Apex RANKING for the result.
- **Endurance team rule:** team = same `kart_number` within a race. The kart's reconstructed final classification is assigned **equally to ALL drivers** who drove that kart. Individual sprint formats: 1 driver = 1 kart = their own result.
- **Architecture:** A — refactor `extractor.py` into explicit, independently testable stages.

## Architecture

Pipeline: `parse → segmenter → race-assembler → results-reconstructor → emit SessionExtract`.

`processor.py` is largely unchanged: it still groups by `(circuit_name, log_date, session_seq)`. `session_seq` now means *assembled-race index*, so downstream grouping is correct automatically.

### File structure

`backend/app/services/ranking/extractor.py` is currently ~407 lines doing parse + windowing + identity + finalize. Split responsibilities into focused units in the same package:

- `extractor/segmenter.py` — replay the parser, cut the event stream into **segments** at every authoritative grid reset. Pure given `(filepath, circuit_name, log_date)` → `list[Segment]`.
- `extractor/assembler.py` — group consecutive segments into **logical races** (stitch endurance reconnects; otherwise one segment = one race). Pure: `list[Segment] → list[Race]`.
- `extractor/results.py` — per race, compute the **reconstructed classification** from lap data and the per-driver/per-kart aggregation. Pure: `Race → list[SessionExtract]`.
- `extractor/__init__.py` (or keep `extractor.py` as the façade) — exposes `extract_sessions(filepath, *, circuit_name, log_date) -> list[SessionExtract]` with the **same signature** as today (the only public contract `processor.py` and tests depend on).
- Identity/lap-dedup helpers (`_RowState`, lap source selection, `normalize_name` use, INIT-grid team_name fallback, drteam swap detection) move into the stage that needs them (mostly `segmenter`/`results`) but keep their current semantics — they are not the bug.

`app/apex/*` is **not** modified (pinned by `test_parser_contract.py`).

### Stage contracts

**Segment** (dataclass): `title1`, `title2`, `first_lap_ts`, `last_lap_ts`, `had_chequered` (bool — a `FLAG=="chequered"` seen while/after laps), `rows: dict[row_id, _RowState]` (laps, names, drteam, retired, last apex position kept only as diagnostic), `kart_set: set[int]`, `row_to_kart` snapshot, `init_team_name` map.

**Segmenter rules** (start a NEW segment when):
- `EventType.INIT` with `value == "init"` is observed (primary, authoritative — Apex pushed a fresh grid), OR
- title changed (`CATEGORY`/`SESSION_TITLE`) and no INIT-init accompanied it (defensive), OR
- existing >20 min idle-with-laps gap rule (kept as a defensive backstop).
Lap/name/position/status events accumulate into the current segment exactly as today. `had_chequered` is set when a chequered `EventType.FLAG` arrives after the segment has laps.

**Race** (dataclass): ordered `segments: list[Segment]`, resolved `title1/title2`, `team_mode` (endurance|individual via existing `classify_session` on the assembled race using combined duration + any-swap), `session_type` (race|pace via `classify_session`).

**Assembler rule:** iterate segments in order; start a new Race per segment; **stitch** the current segment onto the previous Race iff ALL hold:
- same normalized title (`_norm(title)` equality), AND
- previous Race's last segment `had_chequered` is False (race was not finished), AND
- time gap `segment.first_lap_ts − prevRace.last_lap_ts` ≤ `STITCH_GAP_S` (= 300 s), AND
- kart-set overlap `|A∩B| / |A∪B|` ≥ `STITCH_KART_OVERLAP` (= 0.5) (same competitors continuing).
Otherwise the segment is its own Race. Ambiguity ⇒ do NOT stitch (a clean split is less harmful than an over-merge). Constants live at module top, documented.

**Results-reconstructor:** for each Race:
- Build per-row laps using the existing single-source rule (LAP_MS buffer if any, else LAP-string buffer; never mixed). Aggregate across all stitched segments per `row_id`. (A reconnect creates fresh row_ids for the same kart; identity is reconciled by `kart_number`, see below.)
- **Competitor unit:** `team_mode == "endurance"` → competitor = `kart_number`; else competitor = the driver-row (1 driver per kart). Rows with no `kart_number` fall back to their existing `team_key` (`row:<id>`), each its own competitor.
- Per competitor: `retired` = any of its rows flagged retired (`EventType.STATUS == "sr"`); `laps_completed` = sum of valid laps across its row(s); `race_time_ms` = sum of those lap_ms. (Relative proxy: with a common start, fewer-time-for-equal-laps = ahead; for endurance, more laps dominates and time breaks ties — correct for "who is classified ahead".)
- **Classification:** sort competitors by the explicit key `(retired ASC [False before True], laps_completed DESC, race_time_ms ASC, canonical/kart ASC)`; assign `final_position` 1..N. This enforces spec §5 unambiguously: every non-retired (classified) competitor ranks ahead of every retired/DNF one regardless of laps; ties are broken deterministically by laps, then time, then a stable canonical/kart key so reprocesses are reproducible.
- **Emit:** one `SessionExtract` per ratable driver row, `final_position` = the competitor's reconstructed position (for endurance, identical for every driver of the kart). Keep the raw Apex last position only as a new diagnostic field.
- `session_seq` = the Race's 1-based index among emitted Races for this log.

### Processor changes (minimal)

- Grouping key unchanged. `is_race` unchanged: `session_type == "race"` AND any `final_position is not None`.
- Endurance: all drivers of a kart now share `final_position` ⇒ `effective_scores`'s per-`team_key` conflict (current `ValueError` → pace fallback) becomes unreachable for clean data; keep it as defence against dirty data.
- Pace/qualifying/superpole: unchanged — rated by kart-bias-corrected pace, not position. 1-lap superpoles still excluded from race rating by the existing `laps_floor` (3 individual / `MIN_LAPS_PER_DRIVER` endurance) and `MIN_DRIVERS_PER_SESSION`.

### Data model

- `session_results.final_position` now stores the reconstructed classification.
- Add nullable column `apex_last_position INTEGER` to `session_results` via an idempotent `ALTER TABLE … ADD COLUMN` migration in `database.py` (same pattern as existing migrations), populated with the raw last Apex RANKING for audit/debug. Not read by rating logic. Add to `_serialize` paths only if needed for the admin driver-detail (optional; default keep internal).
- `session_seq` semantics change to assembled-race index. Safe: the DB is fully rebuilt by "Reset completo".

## Edge cases

- **Rolling vs standing start:** `race_time_ms` is each driver's own line-to-line elapsed time; for equal lap counts the smaller sum is ahead — monotonic and correct for classification regardless of start type.
- **Endurance long stop:** reflected as fewer laps and/or larger time → correctly behind. Lapped competitors: fewer laps ⇒ behind, exactly the desired result.
- **True new heat, identical title, NO chequered between, short gap, same karts:** would wrongly stitch. Mitigation: the kart-set for a *new* heat in these championship formats differs (different group composition) so overlap < 0.5 ⇒ split; and a real heat almost always emits a chequered before the next grid. Residual ambiguity resolves to SPLIT (safer).
- **Endurance reconnect with a brand-new row_id block:** rows reconciled by `kart_number` (the competitor unit for endurance), so split row_ids for the same kart aggregate into one team.
- **Kart-only recordings (EUPEN):** identity fallback chain (live name → INIT-grid team_name → "KART n"/"ROW id") preserved; reconstruction works (laps+time present).
- **No valid laps for a competitor:** excluded by existing lap-floor before classification ranking, so it cannot occupy a classified slot.

## Testing strategy (TDD against production fixtures)

Tests live in `backend/tests/ranking/`. Keep `test_parser_contract.py` green (no `app/apex/*` changes).

- **New fixtures** from the two diagnosed prod logs, trimmed to the relevant time windows to keep tests fast: an Ariza 2026-05-02 slice (a "HEAT B-C" double-run + a superpole) and a Santos 2026-04-25 slice (the 12 h captured across the reconnect). Stored under `tests/ranking/fixtures/`.
- **Segmenter unit tests:** the Ariza slice yields ≥2 segments for "HEAT B-C" (split on INIT-init); chequered flag recorded; the Santos slice yields the expected segment count.
- **Assembler unit tests:** Ariza "HEAT B-C" → 2 separate Races (chequered between / no stitch); superpole its own Race; Santos reconnect segments → 1 stitched Race (same title, no chequered, gap ≤ 300 s, kart overlap ≥ 0.5).
- **Results unit tests:** in a reconstructed heat, ordering = (laps DESC, time ASC); the known winner gets `final_position == 1`; in the Santos stitched race, kart 9 (KARTINGNOW ENDURANCE) classification ≈ real (≫ 7; expected ~13 region) and **every** kart-9 driver shares it.
- **Methodology/regression:** existing `test_methodology.py`, `test_isolation.py`, `test_extractor.py`, `test_classifier.py` updated to the new behaviour where they assert old (buggy) windowing; add regression asserting Jon del Valle wins → P1 in the Ariza heats and Jorge Izcue no longer gets +60 from a fragment.
- **Dry-run gate (pre-deploy):** a script/test that runs `extract_sessions` on the full Ariza 2026-05-02 and Santos 2026-04-25 prod logs (available on the server) and asserts the headline expectations before deploying.

## Reprocess & deploy plan

1. Implement (TDD), `pytest backend/tests/ranking` green, `python -m py_compile` clean.
2. Dry-run extraction on the two real prod logs via `docker compose exec backend` — assert: Jon del Valle wins the 3 Ariza heats → P1; Santos 12 h kart 9 → realistic (~13) shared by all its drivers; no over-merged 26-lap rows; superpole not race-rated.
3. Commit, push, deploy backend to EC2 (`git pull && docker compose up -d --build`).
4. User clicks **"Reset completo"** in Admin → Ranking → full reprocess of all (~1104) logs rebuilds every rating with the corrected algorithm.
5. Post-reset SANITY (mirror the prior ranking rework): row/session counts, and spot-checks — Jon del Valle's Ariza heats now P1 with coherent ΔELO; Jorge Izcue's 12 h reflects the team's real classification.

## Out of scope

- Live-capture lap corruption / `_is_session_name_upgrade` (issue #1) — already resolved separately; not touched here.
- Frontend ranking UI (the readable session-name fix `7a674f2` is independent and already pushed).
- Changing the Glicko‑2 math itself (`glicko2.py`, `effective_scores` blend `w=0.7`) — only the *inputs* (`final_position`, session grouping, team sharing) change.
