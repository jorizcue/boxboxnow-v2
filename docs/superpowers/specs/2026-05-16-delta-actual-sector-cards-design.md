# Δ ACTUAL Sector Cards — Design

**Date:** 2026-05-16
**Status:** Approved (pending spec review)
**Author:** brainstormed with Jorizcue

## Problem

The existing driver cards **Δ MEJOR S1/S2/S3** (and the combined **Δ Sectores**)
compare the pilot's current sector against the **session-long best** sector of
any kart (`best_sN_ms`). This was confirmed correct by replaying the real RKC
2026-05-16 recording through the live engine: the cards reproduce exactly
(`+0.59/+0.23/+1.08` etc.), and the reference is a single fixed value
(`#24 best S3 = 23.680s`). It does not reconcile against the Apex board because
the board's S1/S2/S3 columns show **best-lap** sectors, while the card uses the
**latest raw pass** vs the **all-session best individual sector**. That is the
documented, intended behaviour of the "MEJOR" family — hence the name.

The pilot wants a complementary view: how their current sector compares against
what every kart has **right now** (their latest live pass), not the historical
record. This is a *live pace* indicator, distinct from the *record* indicator.

## Goal

Add four new, **purely additive** driver cards:

- `deltaCurrentS1`, `deltaCurrentS2`, `deltaCurrentS3` — individual per-sector,
  mirroring `deltaBestS1/2/3`.
- `deltaSectorsCurrent` — combined 3-line card, mirroring `deltaSectors`.

Across all four surfaces: **backend, iOS, Android, web**.

Existing "MEJOR" cards and the `sectorMeta` payload are **unchanged**.

## Semantics

For sector `n` (1/2/3), let the candidate set be every kart that is **on track**
(`pit_status != "in_pit"`) and has a live sector value (`current_sN_ms > 0`).

- `refCurrent = min(current_sN_ms over the candidate set)` — the fastest live
  pass anyone currently shows. The pilot's own kart is part of the candidate
  set **when it meets the candidate criteria** (on track + has a sector);
  symmetric with the MEJOR family. The "I'm the holder" case is handled below;
  a pilot who is in the pit is therefore never the holder.
- Card value for the pilot's kart:
  - **Holder** (pilot's kart owns `refCurrent`): `myCurrent_Sn − secondCurrent_Sn`
    where `secondCurrent` is the 2nd-fastest live pass in the candidate set.
    Renders green (negative or 0). If there is no runner-up (pilot is the only
    on-track kart with a sector), render `0` green. This mirrors the existing
    `isMine` branch but on **current** values instead of **best** values.
  - **Not holder**: `myCurrent_Sn − refCurrent`. Positive → red, negative →
    green (a pilot can briefly be faster on a single pass than the current
    leader's last pass).

The **on-track filter is the load-bearing correctness decision**. On RKC-style
feeds Apex clears S2/S3 at lap start and the engine retains the last non-empty
value, so a kart parked in the pits keeps a stale-fast `current_sN_ms`
indefinitely. Without the filter that ghost would permanently win `refCurrent`
and the card would be meaningless. Excluding `pit_status == "in_pit"` removes
the dominant failure mode.

### Edge cases

| Situation | Behaviour |
|---|---|
| No on-track kart has `current_sN` yet | `sN` entry is `null` → card shows `--` (same as MEJOR when empty) |
| Pilot's kart has no `current_sN` yet | Non-holder branch guards `cur > 0` → card shows `--` / `nil` |
| Only the pilot on track (everyone else in pit) | Pilot is holder, no runner-up → `0` green |
| A pitted kart has a stale-fast `current_sN` | Excluded by `pit_status != "in_pit"` filter |
| Pilot in pit | Card still computes from `current_sN` if present; pilot's own pit status does not blank the card (matches MEJOR) |

Residual known limitation (acceptable for v1): a kart that is retired/parked on
track but **not** flagged `in_pit` can still carry a stale `current_sN`. There
is no reliable "retired" signal in live `KartState`; `pit_status` is the
pragmatic 80/20. Documented, not fixed in v1.

## Architecture

### Backend (`backend/app/engine/state.py`)

`_compute_sector_meta()` already ranks karts by `best_sN_ms` and returns
`{bestMs, kartNumber, driverName, teamName, secondBestMs}` per sector.

- Parameterize it into a single helper that can rank by either `best_sN_ms`
  (existing) or `current_sN_ms` (new), with an optional on-track filter applied
  only for the "current" variant. Two call sites, one formula — DRY.
- Emit a new payload field **`sectorMetaCurrent`** with the **identical shape**
  to `sectorMeta` (same `SectorBest`/`SectorMeta` schema — no new model).
- Attach `sectorMetaCurrent` in the same two places `sectorMeta` is attached:
  `get_snapshot()` and the per-update broadcast, behind the same existing gate
  (`has_sector_event and self.has_sectors`). No new gate, no new broadcast path.

The `current_sN_ms` / `best_sN_ms` kart fields and the SECTOR event handler are
**unchanged**. Cost is O(n_karts) per sector, already paid once for `sectorMeta`;
the second pass is negligible (~30 karts).

### Clients (iOS / Android / web) — same pattern on each

The sector-delta math is already centralized on every platform
(`sectorDelta()` iOS/Android, `computeSectorDelta()` web). Generalize it to take
a **mode** (`best` | `current`) selecting which meta payload and which "my"
value (best vs current) to use; the holder/non-holder branching is written once
and reused. Then:

1. Decode the new `sectorMetaCurrent` payload by **reusing the existing
   SectorMeta model/decoder** (snapshot + per-update message).
2. Add the 4 new cards by cloning the existing render code
   (`sectorDeltaContent`/`deltaSectorsContent` and equivalents), passing
   `mode: .current`.
3. Register the 4 cards in the card catalog / enum / picker, with i18n labels,
   sample values, group, color and icons matching the existing delta-sector
   family (yellow group; LooksOne/Two/Three; ViewAgenda for the combined).

Card surfaces per platform:

- **iOS**: `Shared/Models/SectorMeta.swift` (reuse), `RaceViewModel.swift`
  (decode + generalized `sectorDelta`), `Models/DriverCard.swift` (enum cases +
  group/requiresSectors), `Views/Driver/Cards/DriverCardView.swift` (renderers +
  dispatch), `Shared/Utilities/I18n.swift` (labels).
- **Android**: `vm/RaceViewModel.kt` (decode + generalized `sectorDelta`),
  `models/DriverCard.kt` (enum entries + group/color/icon/sample),
  `ui/driver/DriverCardView.kt` (renderers + `when` dispatch),
  `i18n/Translations.kt` (labels).
- **Web**: `types/race.ts` (`sectorMetaCurrent` on the state/snapshot type, reuse
  `SectorMeta`), `hooks/useRaceState.ts` (apply snapshot/update),
  `hooks/useDriverConfig.ts` (card-id union), `components/driver/DriverView.tsx`
  (generalized `computeSectorDelta` + render + card map),
  `components/driver/DriverConfigTab.tsx` / `DriverConfigPanel.tsx` (picker,
  color class, sample), `lib/i18n.ts` (labels).

### Card identifiers (must be identical across platforms)

Saved layouts persist card ids; they must match so a layout ports between web
and mobile. Use exactly:

`deltaCurrentS1`, `deltaCurrentS2`, `deltaCurrentS3`, `deltaSectorsCurrent`

(parallel to existing `deltaBestS1/2/3`, `deltaSectors`).

### Labels (mirror existing "Δ Mejor"/"Δ Sectores" translation style)

| id | ES | EN | IT | DE |
|---|---|---|---|---|
| deltaCurrentS1/2/3 | Δ Actual S1/S2/S3 | Δ Current S1/S2/S3 | Δ Attuale S1/S2/S3 | Δ Aktuell S1/S2/S3 |
| deltaSectorsCurrent | Δ Sectores Actual | Δ Current Sectors | Δ Settori Attuale | Δ Aktuelle Sektoren |

(If an existing translation key's wording differs in convention, match the
existing convention for that language rather than the table verbatim.)

## Data Flow

Apex WS → parser SECTOR event → engine updates `current_sN_ms`/`best_sN_ms`
(unchanged) → on snapshot/broadcast the engine computes **both** `sectorMeta`
(best, all karts) and `sectorMetaCurrent` (current, on-track only) → WS payload
→ client decodes both into the same SectorMeta model → centralized
`sectorDelta(kart, idx, mode)` → card render.

## Backwards Compatibility

Purely additive. `sectorMetaCurrent` is a new optional field; an old client
ignores it and existing cards keep working. A new client on an old backend
simply gets `sectorMetaCurrent == null` and the new cards render `--` (same as
a no-sectors session). No migration, no breaking change.

## Testing

- **Backend** (`backend/tests/...`, pytest via `backend/.venv/bin/python`):
  - Parameterized `_compute_sector_meta` "current" variant: ranks by
    `current_sN_ms`; returns correct `bestMs`/`kartNumber`/`secondBestMs`;
    `null` when the candidate set is empty.
  - On-track filter: a kart with `pit_status == "in_pit"` and a stale-fast
    `current_sN_ms` is **excluded** from `refCurrent`/holder.
  - "MEJOR" variant output is byte-for-byte unchanged (regression guard).
  - Use a small synthetic kart set (do not hard-code the RKC numbers — that
    would over-fit).
- **Clients**: add a unit test for the generalized delta function in
  `current` mode wherever the existing `sectorDelta`/`computeSectorDelta` has
  coverage (web has unit tests; mirror the existing pattern on iOS/Android —
  do not introduce a new harness).
- **Manual verification**: replay `RKC_Paris/2026-05-16.log` and confirm the
  new cards render and the on-track filter behaves (the read-only
  `/tmp/rkc_trace.py` harness from the investigation is the reference).

## Scope / Non-Goals

- One cohesive, additive feature → one implementation plan with per-platform
  tasks (the change is the same shape repeated four times).
- **Not** changing existing "Δ MEJOR" behaviour or the `sectorMeta` payload.
- **No** smoothing/decay — the live reference flickers green/red on every
  sector crossing; this is inherent to a "current" indicator and explicitly
  accepted ("crudo, es lo que pediste").
- **No** new "theoretical lap" or other derived cards (YAGNI).
