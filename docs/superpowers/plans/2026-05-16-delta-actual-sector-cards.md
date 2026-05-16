# Δ ACTUAL Sector Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 per-sector cards (`deltaCurrentS1/2/3`) + 1 combined (`deltaSectorsCurrent`) that compare the pilot's current sector against the fastest *live pass* among on-track karts, across backend + iOS + Android + web.

**Architecture:** Backend parameterizes `_compute_sector_meta()` to also rank by `current_sN_ms` over on-track karts (`pit_status != "in_pit"`) and emits a new `sectorMetaCurrent` payload (identical `SectorMeta` shape) at all 4 existing `sectorMeta` emit sites. Each client decodes the new payload reusing the existing SectorMeta model, generalizes its centralized sector-delta function with a `current` mode, and registers 4 new cards (catalog + picker + i18n + render) mirroring the existing `deltaBest*`/`deltaSectors` family. Purely additive; existing behavior byte-identical.

**Tech Stack:** Python (FastAPI, pytest), Swift/SwiftUI, Kotlin/Jetpack Compose, TypeScript/React/Zustand.

**Spec:** `docs/superpowers/specs/2026-05-16-delta-actual-sector-cards-design.md`

---

## Locked decisions (no placeholders — use these verbatim)

**Card ids** (identical on all 4 platforms, for layout portability):
`deltaCurrentS1`, `deltaCurrentS2`, `deltaCurrentS3`, `deltaSectorsCurrent`

**i18n labels — ALL FIVE languages `es/en/it/de/fr`** (key = `card.<id>`):

| key | es | en | it | de | fr |
|---|---|---|---|---|---|
| card.deltaCurrentS1 | Δ Actual S1 | Δ Current S1 | Δ Attuale S1 | Δ Aktuell S1 | Δ Actuel S1 |
| card.deltaCurrentS2 | Δ Actual S2 | Δ Current S2 | Δ Attuale S2 | Δ Aktuell S2 | Δ Actuel S2 |
| card.deltaCurrentS3 | Δ Actual S3 | Δ Current S3 | Δ Attuale S3 | Δ Aktuell S3 | Δ Actuel S3 |
| card.deltaSectorsCurrent | Δ Sectores Actual | Δ Current Sectors | Δ Settori Attuale | Δ Aktuelle Sektoren | Δ Secteurs Actuels |

**Spanish `display` fallbacks** (Android enum / web `label` / iOS): `Δ Actual S1`, `Δ Actual S2`, `Δ Actual S3`, `Δ Sectores Actual`.

**Sample values** (config preview): S1 `+0.18s`, S2 `-0.09s`, S3 `+0.31s`, combined `S1 +0.12s`.

**Color / icon / group:** identical to the existing `deltaBest*` / `deltaSectors` family (yellow accent; iOS/Android Looks1/2/3 + ViewAgenda for combined; group = the BBN/sector group; `requiresSectors`=true iOS, `requiresGps`=false web/Android).

**Generalized delta semantics** (`current` mode), per spec:
- reference = the new `sectorMetaCurrent` payload's `sN` (already computed by the backend as min `current_sN_ms` over on-track karts, with `secondBestMs` = 2nd-fastest current).
- non-holder: `myCurrent_Sn − ref.bestMs` (same formula as the existing non-holder branch, different meta source).
- holder (pilot kart == ref.kartNumber): `myCurrent_Sn − ref.secondBestMs` (mirror of the existing isMine branch but using **myCurrent** instead of myBest; `0` when no runner-up).

---

## File Structure

**Backend** (novel logic + catalog + tests):
- `backend/app/engine/state.py` — parameterize `_compute_sector_meta`; emit `sectorMetaCurrent` at state.py:485 (update) + state.py:1335 (snapshot).
- `backend/app/engine/registry.py` — emit `sectorMetaCurrent` at registry.py:653-656 and registry.py:1069-1072 (analytics frames).
- `backend/app/services/driver_cards.py` — add 4 ids to `ALL_DRIVER_CARD_IDS` (after `"deltaSectors"`, line 46).
- `backend/tests/engine/__init__.py` (new), `backend/tests/engine/test_sector_meta.py` (new) — TDD.

**iOS** (`/Users/jizcue/boxboxnow-v2/BoxBoxNow/`):
- `BoxBoxNow/Shared/Models/SectorMeta.swift` — reused as-is (no change).
- `BoxBoxNow/BoxBoxNow/ViewModels/RaceViewModel.swift` — add `sectorMetaCurrent` @Published + decode (mirror every `sectorMeta` decode site) + generalize `sectorDelta` with a `current` param.
- `BoxBoxNow/BoxBoxNow/Models/DriverCard.swift` — 4 enum cases + group/requiresSectors arms.
- `BoxBoxNow/BoxBoxNow/Views/Driver/Cards/DriverCardView.swift` — dispatch + render (reuse `sectorDeltaContent`/`deltaSectorsContent` with a `current` flag + title override).
- `BoxBoxNow/Shared/Utilities/I18n.swift` — 4 keys × 5 langs.

**Android** (`/Users/jizcue/boxboxnow-v2/android/`):
- `app/src/main/java/com/boxboxnow/app/vm/RaceViewModel.kt` — `_sectorMetaCurrent` StateFlow + 2 decode blocks (reuse `parseSectorMeta`) + generalize `sectorDelta`.
- `app/src/main/java/com/boxboxnow/app/models/DriverCard.kt` — 4 enum entries + explicit `accent` + `iconMaterial` arms (these `when`s are exhaustive, no `else` → compile error if omitted).
- `app/src/main/java/com/boxboxnow/app/ui/driver/DriverCardView.kt` — `when (card)` arms + render reuse.
- `app/src/main/java/com/boxboxnow/app/i18n/Translations.kt` — 4 keys × 5 langs.

**Web** (`/Users/jizcue/boxboxnow-v2/frontend/`):
- `src/types/race.ts` — `sectorMetaCurrent?: SectorMeta | null` on `RaceSnapshot`.
- `src/hooks/useRaceState.ts` — store field + default + applySnapshot + applyAnalytics + `applySectorMetaUpdate` signature.
- `src/hooks/useRaceWebSocket.ts` — extract top-level `sectorMetaCurrent` + pass through + BroadcastChannel post.
- `src/hooks/useDriverConfig.ts` — 4 ids in `DriverCardId` union + `ALL_DRIVER_CARDS`.
- `src/components/driver/DriverView.tsx` — destructure `sectorMetaCurrent`; add `label` + meta params to render fns; 4 entries in the exhaustive `cards` record.
- `src/components/driver/DriverConfigTab.tsx` — 4 entries in `CARD_ACCENTS` + `CARD_SAMPLE_VALUES`.
- `src/lib/i18n.ts` — 4 keys × 5 langs.

---

## Task 1: Backend — parameterized `_compute_sector_meta` + `sectorMetaCurrent` emit + TDD

**Files:**
- Modify: `backend/app/engine/state.py` (`_compute_sector_meta` ~1278-1314; emit 485-486; emit 1335)
- Modify: `backend/app/engine/registry.py` (653-656; 1069-1072)
- Create: `backend/tests/engine/__init__.py`, `backend/tests/engine/test_sector_meta.py`

- [ ] **Step 1: Write failing test** `backend/tests/engine/test_sector_meta.py`:

```python
from app.engine.state import RaceStateManager, KartState


def _mk(row, num, *, pit="racing", best=(0, 0, 0), cur=(0, 0, 0)):
    k = KartState(row_id=row, kart_number=num)
    k.pit_status = pit
    k.best_s1_ms, k.best_s2_ms, k.best_s3_ms = best
    k.current_s1_ms, k.current_s2_ms, k.current_s3_ms = cur
    return k


def _state(karts):
    s = RaceStateManager()
    for k in karts:
        s.karts[k.row_id] = k
    return s


def test_best_variant_unchanged_default_arg():
    s = _state([
        _mk("r1", 7, best=(30000, 0, 0), cur=(31000, 0, 0)),
        _mk("r2", 9, best=(29500, 0, 0), cur=(40000, 0, 0)),
    ])
    meta = s._compute_sector_meta()  # default source="best"
    assert meta["s1"]["bestMs"] == 29500
    assert meta["s1"]["kartNumber"] == 9
    assert meta["s1"]["secondBestMs"] == 30000


def test_current_variant_ranks_by_current_ms():
    s = _state([
        _mk("r1", 7, best=(30000, 0, 0), cur=(31000, 0, 0)),
        _mk("r2", 9, best=(29500, 0, 0), cur=(40000, 0, 0)),
    ])
    meta = s._compute_sector_meta(source="current")
    assert meta["s1"]["bestMs"] == 31000      # kart 7's current is fastest
    assert meta["s1"]["kartNumber"] == 7
    assert meta["s1"]["secondBestMs"] == 40000


def test_current_variant_excludes_in_pit_kart():
    # Kart 9 sits in pit with a stale-fast current → must be excluded.
    s = _state([
        _mk("r1", 7, cur=(31000, 0, 0)),
        _mk("r2", 9, pit="in_pit", cur=(22000, 0, 0)),
    ])
    meta = s._compute_sector_meta(source="current")
    assert meta["s1"]["bestMs"] == 31000
    assert meta["s1"]["kartNumber"] == 7
    assert meta["s1"]["secondBestMs"] is None  # only one on-track kart


def test_current_variant_none_when_no_on_track_sector():
    s = _state([_mk("r2", 9, pit="in_pit", cur=(22000, 0, 0))])
    meta = s._compute_sector_meta(source="current")
    assert meta["s1"] is None
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && .venv/bin/python -m pytest tests/engine -q`
Expected: FAIL (`_compute_sector_meta() got an unexpected keyword argument 'source'`).

- [ ] **Step 3: Parameterize `_compute_sector_meta`** in `backend/app/engine/state.py`. Replace the method body (currently 1278-1314) so the signature is `def _compute_sector_meta(self, source: str = "best") -> dict:` and ranking uses `attr = f"{source}_s{s}_ms"`; when `source == "current"` restrict candidates to `k for k in self.karts.values() if k.pit_status != "in_pit"`, else iterate `self.karts.values()` exactly as today. The rest (sorted by ms ascending, `getattr(k, attr) > 0`, `bestMs/kartNumber/driverName/teamName/secondBestMs`, `None` when empty) is unchanged. Update the docstring to document the `source` param and the on-track filter.

Concrete body:

```python
    def _compute_sector_meta(self, source: str = "best") -> dict:
        """Field-wide sector leaders (best + 2nd best per sector).

        source="best"  → rank by each kart's session-long PB
                          (`best_sN_ms`) over ALL karts. Unchanged
                          legacy behaviour; default arg keeps every
                          existing call site byte-identical.
        source="current" → rank by each kart's latest live pass
                          (`current_sN_ms`) over ON-TRACK karts only
                          (`pit_status != "in_pit"`). A kart parked in
                          the pits retains a stale-fast current value;
                          excluding it keeps the live-pace reference
                          meaningful.

        Returns {"s1": {...}|None, "s2": ..., "s3": ...}.
        """
        result: dict = {}
        for s in (1, 2, 3):
            attr = f"{source}_s{s}_ms"
            if source == "current":
                pool = [k for k in self.karts.values()
                        if k.pit_status != "in_pit"]
            else:
                pool = list(self.karts.values())
            ranked = sorted(
                ((getattr(k, attr), k) for k in pool
                 if getattr(k, attr) > 0),
                key=lambda pair: pair[0],
            )
            if not ranked:
                result[f"s{s}"] = None
                continue
            best_ms, leader = ranked[0]
            second_ms = ranked[1][0] if len(ranked) > 1 else None
            result[f"s{s}"] = {
                "bestMs": best_ms,
                "kartNumber": leader.kart_number,
                "driverName": leader.driver_name,
                "teamName": leader.team_name,
                "secondBestMs": second_ms,
            }
        return result
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && .venv/bin/python -m pytest tests/engine -q`
Expected: 4 passed.

- [ ] **Step 5: Emit `sectorMetaCurrent` at all 4 sites.**

`state.py` ~485 (inside `if has_sector_event and self.has_sectors:`), add after the `msg["sectorMeta"] = ...` line:
```python
                    msg["sectorMetaCurrent"] = self._compute_sector_meta(source="current")
```
`state.py` ~1335 (snapshot dict), add after the `"sectorMeta": ...` entry:
```python
                "sectorMetaCurrent": self._compute_sector_meta(source="current") if self.has_sectors else None,
```
`registry.py` ~653-656, add a sibling key after the `"sectorMeta": (...)` entry:
```python
                                "sectorMetaCurrent": (
                                    self.state._compute_sector_meta(source="current")
                                    if self.state.has_sectors else None
                                ),
```
`registry.py` ~1069-1072 — apply the identical sibling addition next to that `"sectorMeta": (...)` entry.

- [ ] **Step 6: Regression — full engine + ranking suites still green**

Run: `cd backend && .venv/bin/python -m pytest tests/engine tests/ranking -q`
Expected: all pass (the `source="best"` default keeps existing output identical).

- [ ] **Step 7: Add the 4 ids to the backend catalog.** In `backend/app/services/driver_cards.py`, in `ALL_DRIVER_CARD_IDS`, immediately after `"deltaSectors",` (line 46) add:
```python
    "deltaCurrentS1",
    "deltaCurrentS2",
    "deltaCurrentS3",
    "deltaSectorsCurrent",
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/engine/state.py backend/app/engine/registry.py backend/app/services/driver_cards.py backend/tests/engine
git commit -m "feat(sectors): backend Δ ACTUAL — current-pass sector meta (on-track) + sectorMetaCurrent payload"
```

---

## Task 2: iOS — decode `sectorMetaCurrent`, generalize delta, 4 cards

**Files:**
- Modify: `BoxBoxNow/BoxBoxNow/ViewModels/RaceViewModel.swift`
- Modify: `BoxBoxNow/BoxBoxNow/Models/DriverCard.swift`
- Modify: `BoxBoxNow/BoxBoxNow/Views/Driver/Cards/DriverCardView.swift`
- Modify: `BoxBoxNow/Shared/Utilities/I18n.swift`
- (No change: `BoxBoxNow/Shared/Models/SectorMeta.swift` — reused.)

- [ ] **Step 1: RaceViewModel — new published payload + decode.** Add `@Published var sectorMetaCurrent: SectorMeta? = nil` next to `sectorMeta` (~line 65). At EVERY site that currently sets `sectorMeta` from a decoded payload (snapshot path ~570-571, update path ~600-601, and any analytics path), add the parallel line decoding the `"sectorMetaCurrent"` key with the SAME existing `decodeSectorMeta(...)` helper and the SAME defensive `keys.contains`/`!= nil` guard used for `sectorMeta`. Example mirror at the snapshot site:
```swift
                if snapshotData.keys.contains("sectorMetaCurrent") {
                    sectorMetaCurrent = decodeSectorMeta(snapshotData["sectorMetaCurrent"])
                }
```
and at the update site:
```swift
            if json["sectorMetaCurrent"] != nil {
                sectorMetaCurrent = decodeSectorMeta(json["sectorMetaCurrent"])
            }
```

- [ ] **Step 2: Generalize `sectorDelta`.** Change the signature to `func sectorDelta(ourKartNumber: Int, sectorIdx: Int, current: Bool = false) -> SectorDelta?`. Inside: `let meta = current ? sectorMetaCurrent : sectorMeta` and use `meta?.best(for: sectorIdx)` for `leader`. Keep the non-holder branch exactly as today (`cur - leader.bestMs`). In the `isMine` branch, replace the value the margin is taken from: `let mine = current ? myCurrent : myBest` and return `SectorDelta(deltaMs: mine - second, isMine: true)` (keep the `mine > 0`/`second > 0` guards returning `SectorDelta(deltaMs: 0, isMine: true)` exactly as today). All four existing call sites keep working unchanged (default `current: false`).

- [ ] **Step 3: DriverCard enum.** In `BoxBoxNow/BoxBoxNow/Models/DriverCard.swift` add cases `deltaCurrentS1`, `deltaCurrentS2`, `deltaCurrentS3`, `deltaSectorsCurrent` adjacent to `deltaBestS1...deltaSectors`. Add them to the SAME `group` arm as `deltaBestS1/2/3`/`deltaSectors`, and to `requiresSectors` (or whichever computed property gates the existing sector cards) with the SAME value. If any `switch` over `DriverCard` is exhaustive without `default`, add the 4 cases there mirroring the sector family.

- [ ] **Step 4: DriverCardView render + dispatch.** Generalize `sectorDeltaContent(for:)` and `deltaSectorsContent`/`deltaSectorsLine` to take a `current: Bool` (default false) + an explicit card title string, calling `raceVM.sectorDelta(ourKartNumber:sectorIdx:current:)` and reading `raceVM.sectorMetaCurrent` for the leader block when `current`. Add dispatch arms: `.deltaCurrentS1 → sectorDeltaContent(for: 1, current: true)` (S2/S3 likewise), `.deltaSectorsCurrent → deltaSectorsContent(current: true)`. The card title for the new cards must resolve to the i18n key `card.deltaCurrentS1` etc. (use the same localization lookup the existing sector cards use for their titles).

- [ ] **Step 5: I18n.** In `BoxBoxNow/Shared/Utilities/I18n.swift`, add the 4 keys with **all five** languages exactly as the "Locked decisions" table, mirroring the structure of the existing `card.deltaBestS1`/`card.deltaSectors` entries (include `fr`).

- [ ] **Step 6: Verify build (best effort).** Run: `cd /Users/jizcue/boxboxnow-v2/BoxBoxNow && xcodebuild -scheme BoxBoxNow -destination 'generic/platform=iOS' build -quiet 2>&1 | tail -20` (if `xcodebuild`/scheme unavailable in this environment, instead grep-verify: every `switch`/dispatch over `DriverCard` now handles the 4 new cases, the 4 i18n keys exist with 5 langs each, `sectorMetaCurrent` is decoded at every `sectorMeta` decode site — and record that a device build is required before release).

- [ ] **Step 7: Commit**
```bash
git add BoxBoxNow/BoxBoxNow/ViewModels/RaceViewModel.swift BoxBoxNow/BoxBoxNow/Models/DriverCard.swift BoxBoxNow/BoxBoxNow/Views/Driver/Cards/DriverCardView.swift BoxBoxNow/Shared/Utilities/I18n.swift
git commit -m "feat(sectors): iOS Δ ACTUAL S1/S2/S3 + combined card"
```

---

## Task 3: Android — decode `sectorMetaCurrent`, generalize delta, 4 cards

**Files:**
- Modify: `android/app/src/main/java/com/boxboxnow/app/vm/RaceViewModel.kt`
- Modify: `android/app/src/main/java/com/boxboxnow/app/models/DriverCard.kt`
- Modify: `android/app/src/main/java/com/boxboxnow/app/ui/driver/DriverCardView.kt`
- Modify: `android/app/src/main/java/com/boxboxnow/app/i18n/Translations.kt`

- [ ] **Step 1: RaceViewModel.** Add `private val _sectorMetaCurrent = MutableStateFlow<SectorMeta?>(null)` + `val sectorMetaCurrent = _sectorMetaCurrent.asStateFlow()` mirroring `_sectorMeta` (lines 146-147). In BOTH decode blocks (snapshot/analytics path ~556-558 and update path ~581-583), add a parallel `if (data.containsKey("sectorMetaCurrent")) { _sectorMetaCurrent.value = parseSectorMeta(data["sectorMetaCurrent"]) }` / `if (el.containsKey("sectorMetaCurrent")) { _sectorMetaCurrent.value = parseSectorMeta(el["sectorMetaCurrent"]) }`. `parseSectorMeta` is shape-generic — reuse unchanged.

- [ ] **Step 2: Generalize `sectorDelta`.** Add a `current: Boolean = false` param. `val leader = (if (current) _sectorMetaCurrent.value else _sectorMeta.value)?.bestFor(sectorIdx) ?: return null`. Non-holder branch unchanged (`myCurrent - leader.bestMs`). isMine branch: `val mine = if (current) myCurrent else myBest` then `val d = if (mine != null && mine > 0 && sb != null && sb > 0) mine - sb else 0.0`. Existing call sites keep working (default false).

- [ ] **Step 3: DriverCard.kt enum + exhaustive whens.** Add entries after `DeltaSectors`:
```kotlin
    DeltaCurrentS1("deltaCurrentS1", "Δ Actual S1", "+0.18s"),
    DeltaCurrentS2("deltaCurrentS2", "Δ Actual S2", "-0.09s"),
    DeltaCurrentS3("deltaCurrentS3", "Δ Actual S3", "+0.31s"),
    DeltaSectorsCurrent("deltaSectorsCurrent", "Δ Sectores Actual", "S1 +0.12s"),
```
The `accent` `when (this)` (119-147) and `iconMaterial` `when (this)` (149-179) have **no `else`** — add explicit arms or it will not compile:
```kotlin
        DeltaCurrentS1, DeltaCurrentS2, DeltaCurrentS3 -> Color(0xFFFFCC00)
        DeltaSectorsCurrent -> Color(0xFFFFCC00)
```
```kotlin
        DeltaCurrentS1 -> Icons.Filled.LooksOne
        DeltaCurrentS2 -> Icons.Filled.LooksTwo
        DeltaCurrentS3 -> Icons.Filled.Looks3
        DeltaSectorsCurrent -> Icons.Filled.ViewAgenda
```
`group` (else→RACE_BBN) and `requiresGPS` (else→false) need no change. `companion`/`labelKey` need no change.

- [ ] **Step 4: DriverCardView.kt.** Generalize `SectorDeltaContent` / `DeltaSectorsContent` / `DeltaSectorsLine` with a `current: Boolean = false` param: pull `sectorMeta` from `raceVM.sectorMetaCurrent.collectAsState()` when `current` for the leader block, and call `raceVM.sectorDelta(sectorIdx, current = current)`. Add `when (card)` arms after the `DeltaSectors` arm (~706):
```kotlin
        DriverCard.DeltaCurrentS1 -> SectorDeltaContent(sectorIdx = 1, current = true, /* same other args as DeltaBestS1 */ )
        DriverCard.DeltaCurrentS2 -> SectorDeltaContent(sectorIdx = 2, current = true, ...)
        DriverCard.DeltaCurrentS3 -> SectorDeltaContent(sectorIdx = 3, current = true, ...)
        DriverCard.DeltaSectorsCurrent -> DeltaSectorsContent(current = true, ...)
```
(pass the identical other arguments the existing `DeltaBestS1`/`DeltaSectors` arms pass; `sectorMeta` arg for the new individual cards must be the `sectorMetaCurrent` value).

- [ ] **Step 5: Translations.kt.** Add 4 entries adjacent to `"card.deltaSectors"` (line 374), each `mapOf(Language.ES to ..., Language.EN to ..., Language.IT to ..., Language.DE to ..., Language.FR to ...)` per the Locked-decisions table (all 5 languages).

- [ ] **Step 6: Verify build (best effort).** Run: `cd /Users/jizcue/boxboxnow-v2/android && ./gradlew :app:compileDebugKotlin -q 2>&1 | tail -25` (if Gradle unavailable here, grep-verify the `accent`/`iconMaterial` whens include all 4 new entries, the `when(card)` has all 4 arms, the 4 Translations entries have 5 langs each, and record that a Gradle build is required before release).

- [ ] **Step 7: Commit**
```bash
git add android/app/src/main/java/com/boxboxnow/app/vm/RaceViewModel.kt android/app/src/main/java/com/boxboxnow/app/models/DriverCard.kt android/app/src/main/java/com/boxboxnow/app/ui/driver/DriverCardView.kt android/app/src/main/java/com/boxboxnow/app/i18n/Translations.kt
git commit -m "feat(sectors): Android Δ ACTUAL S1/S2/S3 + combined card"
```

---

## Task 4: Web — payload type, store wiring, render, config, i18n

**Files:**
- Modify: `frontend/src/types/race.ts`
- Modify: `frontend/src/hooks/useRaceState.ts`
- Modify: `frontend/src/hooks/useRaceWebSocket.ts`
- Modify: `frontend/src/hooks/useDriverConfig.ts`
- Modify: `frontend/src/components/driver/DriverView.tsx`
- Modify: `frontend/src/components/driver/DriverConfigTab.tsx`
- Modify: `frontend/src/lib/i18n.ts`

- [ ] **Step 1: Type.** In `frontend/src/types/race.ts`, in `RaceSnapshot` (lines 247-265) add after the `sectorMeta?` line:
```ts
  sectorMetaCurrent?: SectorMeta | null;
```

- [ ] **Step 2: Store.** In `frontend/src/hooks/useRaceState.ts`: add `sectorMetaCurrent: SectorMeta | null;` to the store interface (next to `sectorMeta`, ~line 34); add `sectorMetaCurrent: null,` to the default state (~line 149); in `applySnapshot` (~207-219) and `applyAnalytics` (~387-396) add a parallel `if (Object.prototype.hasOwnProperty.call(<src>, "sectorMetaCurrent")) { out.sectorMetaCurrent = <src>.sectorMetaCurrent ?? null; }`; change `applySectorMetaUpdate` signature to `(hasSectors, meta, metaCurrent) => set({ hasSectors, sectorMeta: meta, sectorMetaCurrent: metaCurrent ?? null })` and update its interface declaration (~86-90).

- [ ] **Step 3: WS hook.** In `frontend/src/hooks/useRaceWebSocket.ts` (~130-150) where the top-level `sectorMeta`/`hasSectors` are pulled off the message and forwarded to `applySectorMetaUpdate` + posted to the BroadcastChannel: also read `anyMsg.sectorMetaCurrent`, pass it as the new 3rd arg to `applySectorMetaUpdate`, and include `sectorMetaCurrent: anyMsg.sectorMetaCurrent` in the `ch?.postMessage(...)`. Also handle it on the BroadcastChannel receive side if that path calls `applySectorMetaUpdate` (mirror exactly how `sectorMeta` is handled there).

- [ ] **Step 4: Card catalog.** In `frontend/src/hooks/useDriverConfig.ts`: add `| "deltaCurrentS1" | "deltaCurrentS2" | "deltaCurrentS3" | "deltaSectorsCurrent"` to the `DriverCardId` union (after `"deltaSectors"`); add 4 entries to `ALL_DRIVER_CARDS` after the `deltaSectors` entry:
```ts
  { id: "deltaCurrentS1", labelKey: "card.deltaCurrentS1", label: "Δ Actual S1", requiresGps: false, group: "raceBbn" },
  { id: "deltaCurrentS2", labelKey: "card.deltaCurrentS2", label: "Δ Actual S2", requiresGps: false, group: "raceBbn" },
  { id: "deltaCurrentS3", labelKey: "card.deltaCurrentS3", label: "Δ Actual S3", requiresGps: false, group: "raceBbn" },
  { id: "deltaSectorsCurrent", labelKey: "card.deltaSectorsCurrent", label: "Δ Sectores Actual", requiresGps: false, group: "raceBbn" },
```
(`DEFAULT_CARD_ORDER`/`defaultVisible` derive from this — no further change.)

- [ ] **Step 5: DriverView render.** In `frontend/src/components/driver/DriverView.tsx`: add `sectorMetaCurrent` to the `useRaceStore()` destructure (~553). Add a `label: string` parameter to `renderSectorDeltaCard` and `renderDeltaSectorsCard` and use it instead of the hardcoded `` `Δ Mejor S${sectorIdx}` `` / `"Δ Sectores"` (update the 5 existing call sites at 1340-1344 to pass the existing label string so behavior is unchanged: `renderSectorDeltaCard(1, hasSectors, sectorMeta, ourKartObj, t("card.deltaBestS1"))` etc., and `renderDeltaSectorsCard(hasSectors, sectorMeta, ourKartObj, t("card.deltaSectors"))`). `computeSectorDelta` is pure and reused as-is (it already takes the meta as a param). Add the 4 new entries to the exhaustive `cards` record:
```ts
    deltaCurrentS1: renderSectorDeltaCard(1, hasSectors, sectorMetaCurrent, ourKartObj, t("card.deltaCurrentS1")),
    deltaCurrentS2: renderSectorDeltaCard(2, hasSectors, sectorMetaCurrent, ourKartObj, t("card.deltaCurrentS2")),
    deltaCurrentS3: renderSectorDeltaCard(3, hasSectors, sectorMetaCurrent, ourKartObj, t("card.deltaCurrentS3")),
    deltaSectorsCurrent: renderDeltaSectorsCard(hasSectors, sectorMetaCurrent, ourKartObj, t("card.deltaSectorsCurrent")),
```
(Holder/`isMine` semantics for the current variant come for free: `sectorMetaCurrent.sN.secondBestMs` is the 2nd-fastest current from the backend, so `computeSectorDelta`'s existing `myBest - leader.secondBestMs` path is acceptable for v1; if the implementer judges `myCurrent - secondBestMs` is required for exact spec parity with iOS/Android, thread a `current` flag through `computeSectorDelta` mirroring those platforms — keep the 3 platforms' holder formula identical.)

- [ ] **Step 6: Config maps.** In `frontend/src/components/driver/DriverConfigTab.tsx` add to `CARD_ACCENTS` (after `deltaSectors`, all yellow) and `CARD_SAMPLE_VALUES`:
```ts
  deltaCurrentS1: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaCurrentS2: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaCurrentS3: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  deltaSectorsCurrent: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
```
```ts
  deltaCurrentS1: "+0.18s",
  deltaCurrentS2: "-0.09s",
  deltaCurrentS3: "+0.31s",
  deltaSectorsCurrent: "S1 +0.12s",
```
(`DriverConfigPanel.tsx` has no such maps — auto-handled via `ALL_DRIVER_CARDS`.)

- [ ] **Step 7: i18n.** In `frontend/src/lib/i18n.ts` add 4 keys after `"card.deltaSectors"` (line 758), each `{ es, en, it, de, fr }` per the Locked-decisions table.

- [ ] **Step 8: Verify typecheck + build.**

Run: `cd /Users/jizcue/boxboxnow-v2/frontend && npx tsc --noEmit 2>&1 | tail -20 && npm run build 2>&1 | tail -15`
Expected: no TS errors (the exhaustive `Record<DriverCardId, …>` maps force all 4 ids everywhere) and a successful production build.

- [ ] **Step 9: Commit**
```bash
git add frontend/src/types/race.ts frontend/src/hooks/useRaceState.ts frontend/src/hooks/useRaceWebSocket.ts frontend/src/hooks/useDriverConfig.ts frontend/src/components/driver/DriverView.tsx frontend/src/components/driver/DriverConfigTab.tsx frontend/src/lib/i18n.ts
git commit -m "feat(sectors): web Δ ACTUAL S1/S2/S3 + combined card"
```

---

## Task 5: End-to-end verification on the real RKC recording

**Files:** none modified (verification only). Uses the read-only harness pattern from `/tmp/rkc_trace.py`.

- [ ] **Step 1: Replay-verify the backend payload.** Adapt the existing `/tmp/rkc_trace.py` (replays `RKC_Paris/2026-05-16.log` through `RaceStateManager`) to also call `state._compute_sector_meta(source="current")` at the end-of-chrono block. Confirm: it returns non-null `s1/s2/s3`; the leader is an on-track kart; an `in_pit` kart with a stale-fast `current_sN` is NOT the leader. Print both `sectorMeta` and `sectorMetaCurrent` side by side for sanity.

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python /tmp/rkc_trace.py 2>&1 | tail -30`
Expected: `sectorMetaCurrent` populated, on-track leader, pitted ghost excluded.

- [ ] **Step 2: Full backend suite green**

Run: `cd backend && .venv/bin/python -m pytest tests -q`
Expected: all pass.

---

## Self-Review

- **Spec coverage:** backend parameterized helper + on-track filter + `sectorMetaCurrent` at all 4 emit sites (Task 1, steps 3/5; sites enumerated from grep: state.py 485 & 1335, registry.py 653 & 1069) ✔; iOS/Android/web decode + generalized delta + 4 cards + 5-lang i18n (Tasks 2-4) ✔; backend catalog `ALL_DRIVER_CARD_IDS` (Task 1 step 7) ✔; holder/non-holder semantics per spec (Task 2/3 step 2, Task 4 step 5) ✔; additive/no-regression guard (Task 1 steps 1-2-6) ✔; manual RKC verification (Task 5) ✔.
- **Placeholder scan:** card ids, all 5-language strings, sample values, colors, file paths, emit-site line numbers, exact pytest/tsc/build commands are all concrete. The only soft note is web `computeSectorDelta` holder-formula parity (Task 4 step 5) — explicitly bounded with a decision rule (keep all 3 clients' holder formula identical), not a TBD.
- **Type consistency:** card ids `deltaCurrentS1/2/3`,`deltaSectorsCurrent` used identically in backend catalog, iOS enum, Android enum (`DeltaCurrentS1` ↔ key `"deltaCurrentS1"`), web union/`ALL_DRIVER_CARDS`/`cards` record, and the i18n key `card.<id>` on all platforms. `source="best"|"current"` consistent backend; `current: Bool/Boolean` flag consistent iOS/Android; `sectorMetaCurrent` field name consistent payload→all clients.
- **Languages:** every i18n step explicitly states all 5 (`es/en/it/de/fr`) — flagged because the codebases have FR (research finding), not the 4 the original ask implied.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-16-delta-actual-sector-cards.md`.
Execution: **superpowers:subagent-driven-development** (fresh implementer subagent per task + spec-compliance then code-quality review between tasks), on `main` per the user's standing workflow. After all tasks: full backend suite + web build green → commit per task is already done → **push to `origin/main`, do NOT deploy** (explicit user instruction).
