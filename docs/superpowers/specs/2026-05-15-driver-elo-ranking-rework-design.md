# Driver ELO/Glicko-2 Ranking — Extraction & Methodology Rework

**Date:** 2026-05-15
**Status:** Approved design (pre-implementation)
**Owner:** Jorge / BoxBoxNow

---

## 1. Problem & diagnosis (facts)

The driver ranking exists (Glicko-2, global + per-circuit) but is effectively
broken in production. Investigation against the live prod DB and the 1104
recording logs found:

- All 1104 logs are in `processed_logs` (the batch "ran"), but only **19
  distinct competitive sessions** across **6 circuits** ever produced ratings.
  Max sessions per driver = **5** (1 driver); 548 drivers have 1 session.
- `driver_circuit_ratings` is **empty** in prod despite the code creating rows.
- Root cause is **not** a session-collapse bug and **not** sparse data. It is
  that `app/services/ranking/log_parser.py` is a hardcoded regex parser that
  only understands ONE Apex column schema (the RKC_Paris family:
  `r<N>|*|<ms>|`, `r<N>c4|drteam|<NAME>`). The majority of circuits use a
  different schema (e.g. EUPEN/kartbahn/Palmela/Campillos:
  `r<N>|*||` empty marker, driver in `r<N>c5|dr|<NAME>`, lap time as a
  time-string in a column event like `r<N>c11|ti|2:30.449`). The regex never
  matches → zero laps → zero sessions. EUPEN alone has ~42 data logs → 0
  results; kartbahn 16→0; Palmela 13→0; Campillos 10→0; Santos/WSK/Ardennes/
  Pomposa likewise.
- The live/replay parser (`app/apex/parser.py`) already handles **every**
  circuit's schema, because it builds its `column_map` dynamically from the
  grid header (`COLUMN_TYPES`: `dr`→name, `rk`→position, `llp`/`blp`→laps,
  lap classes `tn/ti/tb/to`). That is why live timing works everywhere.
- Real finishing positions ARE recoverable for all formats: race logs contain
  abundant `r{id}|#|{pos}` ranking events plus finish signals
  (`lf`/`gf`/`sf` finish, `sr` retired). Session duration is derivable from
  the per-minute timestamps the recordings already carry.

The ranking parser is fully isolated: `log_parser.py` is imported **only** by
`processor.py`; nothing in live timing or replay imports it, and the ranking
pipeline does not import `app/apex/*`. So the extraction can be reworked with
zero risk to live timing or replay.

## 2. Goals / non-goals

**Goals**
- Extract ratable sessions correctly from **all** circuits/formats.
- Methodology: races → real final position; non-race (quali/practice/short
  heats) → kart-bias-corrected average lap. Endurance attribution = team
  finishing position adjusted by individual pace.
- Reprocess the full historical corpus (all 1104 logs, all 24 circuits) with
  correct global chronological order.
- Ranking page exposes all drivers (remove the hard 100 cap).
- Do not modify live timing or replay code.

**Non-goals (v1, YAGNI)**
- No weighting of a session's rating influence by its importance/duration
  (Glicko-2's RD already models confidence).
- No splitting an endurance race into per-stint rating events (one Glicko
  update per `(driver, session)`).
- No new UI beyond removing the cap and surfacing `session_type` / effective
  score in the existing driver detail card.

## 3. Architecture

Read-only reuse of the live parser as a library. Nothing in `app/apex/*`,
`app/engine/*`, replay/live routes is modified.

```
data/recordings/<Circuit>/<YYYY-MM-DD>.log[.gz]
  → app/apex/replay.parse_log_file()        [REUSED, unmodified]
       yields ordered (timestamp, apex_message)
  → app/apex/parser.ApexParser              [REUSED, unmodified]
       dynamic column_map, position rk/#, last/best lap, driver dr/drteam,
       kart, sectors, finish signals
  → NEW app/services/ranking/extractor.py   [ranking-owned adapter]
       segment into sessions, classify, build per-driver SessionExtract
  → REVISED app/services/ranking/processor.py
       Glicko-2 methodology (race→position, pace→corrected avg lap)
  → DB: session_results / driver_ratings / driver_circuit_ratings /
        rating_history / processed_logs
```

- `app/services/ranking/log_parser.py` (fragile regex) is **replaced** by
  `extractor.py`, which drives the live parser and consumes its event stream
  read-only. `processor.py` is revised for the new methodology and the new
  `SessionExtract` interface.
- The adapter is the only place coupled to the live parser's API. If that API
  changes, only `extractor.py` is touched, never the live parser.
- Two independently testable units: `extractor.py` (raw log → list of
  `SessionExtract`) and `processor.py` (`SessionExtract` → Glicko updates).

## 4. Session segmentation & classification

**Segmentation** (raw log → sessions):
- A session is the block between `title1`/`title2` changes. The extractor
  watches the raw `title1||` / `title2||` lines from the replay stream itself
  (independent of any live-parser internal state).
- **Time-gap split:** if **> 20 minutes** pass with no lap event, the current
  session is closed even if the title did not change. Prevents merging
  distinct heats of the same day when a circuit does not change its title.
- `duration_s` = (timestamp of last lap − timestamp of first lap) of the
  segment, from the `(timestamp, message)` pairs the replay yields.
- `session_seq` = ordinal of the session within `(circuit, log_date)`,
  assigned in chronological order by the extractor.

**Race vs pace classification** (cascade, multi-language; case-insensitive,
accent-insensitive):
1. **Non-race keywords → pace path:** `ESSAIS`, `CHRONOS`, `CRONOS`,
   `QUALI`, `Q1`/`Q2`/`Q3` (and `Q<n>`), `LIBRE`/`LIBRES`, `PRACTICE`,
   `FREE`, `FP<n>`, `PROVE`, `ENTRENO`/`ENTRENAMIENTO`, `WARM`,
   `BRIEFING`, `ACCUEIL`, and bare `SESSION`/`SESIÓN` with no race number.
2. **Race keywords → position path:** `CARRERA`, `COURSE`, `RACE`,
   `GARA`, `RENNEN`, `FINAL`, `FINALE`, `GP`, `GRAN PREMIO`,
   `GRAND PRIX`, `MANGA`, `HEAT`, `RACING`, `RESIST*`, `ENDURANCE`, and
   duration patterns in the title `\d+\s*(H|HEURES|HOURS|HORAS|ORE|
   STUNDEN|HRS?)`.
3. **No clear title signal** (e.g. `"Session 7"`, `"14. RACING - 11:20"`,
   empty title): decide by **duration** — `>= 12 min` ⇒ race (position);
   `< 12 min` ⇒ pace (average lap).

Rule precedence: non-race keyword (1) wins over race keyword (2) when both
appear (e.g. titles containing both "RACE" and "CHRONOS" are pace). Duration
(3) is only consulted when neither keyword class matches.

**Endurance/team vs sprint/individual** (only affects race-type sessions;
determines attribution):
- **Endurance/team** if ANY of: a driver swap occurred on a kart during the
  session (same row, multiple distinct `dr`/`drteam` over time), OR
  `duration_s >= 40 min`, OR title matches
  `HEURES/HOURS/HORAS/ORE/STUNDEN/ENDURANCE/RESIST*`.
- **Sprint/individual** otherwise.

**Validity filters:** a session needs ≥ 3 ratable drivers. A driver needs
≥ 5 valid laps to be ratable; for sprint/individual sessions
(`team_mode == "individual"`) the threshold is lowered to ≥ 3 valid laps
(short heats legitimately have few laps).

## 5. Per-driver extraction & real final position

`extractor.py` feeds replay `(timestamp, message)` blocks to `ApexParser`,
consumes its event stream read-only, and maintains minimal per-session state:

- `row → current driver` (from `dr`/`drteam` events; on a swap, each lap is
  attributed to whoever was driving at that lap's timestamp).
- `row → kart` (grid mapping the parser already provides).
- `driver → [lap_ms]` (from lap events the parser already normalizes from
  BOTH schemas: inline `*|<ms>` and column time-strings like
  `c11|ti|2:30.449`).
- `row → last position` (from `#`/`rk` events).
- Finish signal: `lf`/`gf`/`sf` (finish) / `sr` (retired).

**Team identity (endurance):** a team = a kart with rotating drivers within
the session. All drivers sharing a `kart_number` in that session belong to
the same team; the **team's final position = that kart's position at the
finish**.

**Final position:**
- Sprint/individual: the driver's own kart position at the finish.
- Endurance/team: the kart's position at the finish, assigned to every driver
  who drove it (the individual-pace adjustment is applied in §6).
- Value taken at the finish signal; if no finish signal, the last position
  seen in the session.
- **Retired (`sr`)**: classified **behind all classified runners** (worst
  positions, ordered among themselves by laps completed) — but only if the
  driver has ≥ the minimum valid laps; otherwise excluded entirely.
- **Graceful degradation:** a session classified as "race" that has zero
  position events (`#`/`rk`) is rated via the pace path (corrected average
  lap) instead of being discarded.

**Output interface** (`SessionExtract`, one per driver per session):
```
circuit_name, log_date, title1, title2, session_seq,
session_type: "race" | "pace",
team_mode:    "endurance" | "individual",
driver_canonical, driver_raw, kart_number, team_key,
laps_ms: list[int], total_laps, best_lap_ms, avg_lap_ms, median_lap_ms,
final_position: int | None,    # real (team or individual); None ⇒ pace fallback
duration_s: int
```
Name normalization keeps the existing `normalizer.py`; cross-format/circuit
variants of the same driver are reconciled by the existing alias/`merge_drivers`
tooling.

## 6. Glicko-2 methodology

One Glicko-2 update per `(driver, session)`. Sessions are processed in true
global chronological order so the global rating evolves correctly across
circuits. Glicko remains pairwise (each rated driver vs each other in the
session, score 1 / 0.5 / 0 → existing `update()`); only the **ordering key**
changes by session type.

**A) Race session with positions** — per driver compute an effective
classification score (lower = better):
```
norm_team_pos = (team_position − 1) / (n_teams − 1)              ∈ [0,1]  (0 = winning team)
pace_rank     = 1..n_drivers, sorting all rated drivers in the session
                by kart-bias-corrected avg lap ascending (1 = fastest)
pace_pctile   = (pace_rank − 1) / (n_drivers − 1)                ∈ [0,1]  (0 = fastest in field)
effective     = w · norm_team_pos + (1 − w) · pace_pctile
```
`n_teams` = distinct classified teams/karts in the session; `n_drivers` =
rated drivers in the session. Both `_pctile` terms are normalized the same
way so `w` blends comparable [0,1] quantities. Degenerate denominators
(`n_teams == 1` or `n_drivers == 1`) are handled by the §6 edge rule.
- Sprint/individual: `team_position` = the driver's own real position.
- Endurance/team: teammates share `team_position`; `pace_pctile` (their own
  corrected pace over their stints) differentiates them and corrects
  "fast driver in a slow team / slow driver in a strong team".
- Field is ordered by `effective`; pairwise Glicko outcomes are built from
  that order: for drivers i,j → 1.0 if `effective_i < effective_j`, 0.0 if
  `>`, 0.5 if `|effective_i − effective_j| < 1e-9` (tie). Fed to the existing
  `update()`.
- **Default `w = 0.7`** (race result dominates; pace separates teammates and
  corrects team strength). Single tunable parameter.
- Edge: if `n_teams == 1` then `norm_team_pos` is undefined → the session
  degrades to pure pace ordering (`effective = pace_pctile`).

**B) Pace session** (quali/practice/short heats `< 12 min`, or race-without-
positions fallback): unchanged from current behaviour — single-pass per-kart
bias correction (per-kart mean vs field mean), order by corrected average
lap, pairwise Glicko.

**C) Dual track** (unchanged design): global rating + per-circuit rating, same
outcomes, separate pre-update states. The new `processor.py` must populate
`driver_circuit_ratings` (empty in prod today); root cause of the empty table
is diagnosed during implementation and verified non-empty after reprocess.

Kart-bias correction (existing single-pass approximation) is reused for the
pace value everywhere (pace sessions and the `pace_pctile` term of races).

## 7. Data model & DB changes

**`session_results` — new/changed columns:**
- `session_type` TEXT (`"race"`/`"pace"`).
- `team_mode` TEXT (`"endurance"`/`"individual"`).
- `final_position` INT — **semantics change**: now the real position (team or
  individual). Pace rank is still derivable from `corrected_avg_ms`.
- `effective_score` FLOAT — the computed `effective` (transparency on the
  driver detail card: explains rating moves).
- `duration_s` INT.
- `session_seq` INT.

**Uniqueness fix:** the current unique key
`(circuit_name, log_date, title1, title2, driver_id)` is insufficient now
that segmentation also splits by time gap (two same-day heats with
empty/identical titles would collide). New key:
`(circuit_name, log_date, session_seq, driver_id)`.

**Migration:** `session_results` is wiped and regenerated by the reprocess
anyway, so the table is **recreated** with the new schema + new unique
constraint (the codebase already uses table-recreate migrations for SQLite
constraint changes in `app/models/database.py`). Any new columns on other
tables, if needed, via idempotent `try/except` `ALTER` blocks (existing
pattern).

**`driver_circuit_ratings`:** no schema change; populated correctly by the
new processor; verified after reprocess.

**`processed_logs`:** unchanged key `(circuit_name, log_date)` (one log file
per date) → idempotency intact. `reset_ratings(wipe_drivers=False)` already
clears ratings/history/processed_logs/session_results while preserving drivers
and aliases.

**API / page (`ranking_routes.py`, `processor.get_top_drivers`):**
- Remove the hard `limit = 100`; return all drivers with pagination;
  `min_sessions` becomes a query parameter (page default 2; underlying data
  includes everyone).
- Driver detail card shows `session_type` and the `effective_score` breakdown.

## 8. Reprocessing & scope

- One-time full reprocess: `reset_ratings(wipe_drivers=False)` then process
  **all 1104 logs across all 24 circuits**.
- **Global chronological order:** sort all `(circuit, log_date)` by date and,
  within a log, sessions by `session_seq`, oldest → newest. Required for
  correct temporal evolution of the global rating across circuits.
- **Trigger:** an admin-triggered endpoint / dedicated script (idempotent,
  progress-logged, re-runnable), run once on the server as a background task
  (does not block requests). The existing periodic `ranking_runner` continues
  to handle incrementals (only logs not in `processed_logs`).
- **Performance:** replaying ~1104 logs through `ApexParser` (most empty/tiny;
  ~50 with real data, some 3 MB / 27k laps) — expected minutes to low tens of
  minutes for the one-off. Acceptable.
- Scope: all circuits, all logs, full detail. The "100" was only the page
  query and is removed.

## 9. Testing & validation

- **Unit tests:** classifier (multi-language taxonomy + duration/gap rules)
  table-driven from observed real titles (`24 HEURES`, `ESSAIS CHRONOS`,
  `FP1`, `14. RACING - 11:20`, `Session N`, `CARRERA 3H`/`CRONOS`/`LIBRES`,
  `Prove`, `Finale`…); endurance-vs-individual detection; pure-function test
  of `effective` blending (w); extractor adapter on small fixtures of BOTH
  schemas (RKC inline-ms and EUPEN column-time) asserting laps/position/team.
- **Golden/validation:** 2–3 known events (e.g. the 24h ESSEC final
  classification, a HENAKART `CARRERA 3H`) — extracted `final_position`
  ordering matches the Apex chequered order. Post-reprocess sanity metrics:
  EUPEN/kartbahn/Palmela now produce sessions; `driver_circuit_ratings`
  non-empty; driver session-count distribution far above the current max of 5.
- **Regression guard:** a test asserting the ranking pipeline does not import
  or modify `app/apex/*` beyond read-only use (isolation contract).
- **Manual:** spot-check the ranking page and driver cards for plausibility
  after the full reprocess.

## 10. Risks / edge cases

- Live-parser API coupling → contained to the thin adapter (one file).
- Cross-format/circuit name variance → existing `normalizer.py` +
  `merge_drivers`.
- Session with no finish signal / no positions → pace fallback (§5).
- Retired (`sr`) → ranked behind classified runners if ≥ min laps, else
  excluded (§5).
- Idle logs (no laps) → yield zero sessions, skipped.
- Reprocess duration → controlled one-off + incremental runner; progress
  logged.
- Tunables to revisit after first real run: `w` (0.7), the 12-min
  race/pace threshold, the 20-min gap split, the 40-min endurance threshold.
