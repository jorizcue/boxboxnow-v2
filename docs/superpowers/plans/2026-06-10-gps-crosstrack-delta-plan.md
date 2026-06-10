# Cross-track GPS current-lap delta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the distance-interpolated GPS current-lap delta with a position-based (cross-track) delta against the reference lap on iOS + Android, and add a `projectedLap` driver card (reference lap + smoothed delta), matching RaceBox circuit mode.

**Architecture:** Per GPS sample, project the kart's position onto the reference lap's GPS polyline within a monotonic moving window, interpolate the reference elapsed time at the perpendicular foot, and subtract from the live elapsed time. The displayed value is smoothed over the last 10 samples. `projectedLap = reference.durationMs + smoothedDelta`. Computed on-device; only the new card's catalog entry/label touches web + backend (no schema change).

**Tech Stack:** Swift (iOS, XCTest), Kotlin (Android, JUnit4), TypeScript (web catalog), Python (backend catalog list + existing pytest).

**Design doc:** `docs/superpowers/specs/2026-06-10-gps-crosstrack-delta-design.md`. Reverse-engineered RaceBox reference: `~/.claude/.../memory/racebox_delta_algorithm.md`.

**Shared constants (use identical values on both platforms):** `searchFwd = 60`, `searchBack = 20`, `maxPerpM = 25.0`, `smoothCap = 10`. Sign convention: `delta > 0` = behind reference, `< 0` = ahead.

## Environment / toolchain (READ FIRST — tools are installed but not on PATH)

Run repo commands from `/Users/jizcue/boxboxnow-v2`. Export these before the relevant build/test commands (no sudo needed):

```bash
# iOS (Xcode 26.4 is installed; CommandLineTools is the active dir, so set DEVELOPER_DIR)
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
# Android (Java 21 ships inside Android Studio's JBR)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

- iOS test/build destination: `-destination 'platform=iOS Simulator,name=iPhone 17'` (iOS 26.4 runtime; iPhone 17 sim exists). Scheme + app target are both `BoxBoxNow`.
- Backend tests: use the repo venv — `backend/.venv/bin/python -m pytest ...` (run from `backend/`).
- Web: `node` v24 is on PATH; use `npm`/`npx` directly in `frontend/`.

---

## Task 1: iOS unit-test target

**Files:**
- Create: `BoxBoxNow/BoxBoxNowTests/CrossTrackTests.swift`
- Modify: `BoxBoxNow/BoxBoxNow.xcodeproj/project.pbxproj`

The app currently has no test target (only `ENABLE_TESTABILITY = YES`). App target: `BoxBoxNow`, bundle `com.fsernandez.BoxBoxNow`.

- [ ] **Step 1: Create the test folder + a trivial test**

`BoxBoxNow/BoxBoxNowTests/CrossTrackTests.swift`:
```swift
import XCTest
@testable import BoxBoxNow

final class CrossTrackTests: XCTestCase {
    func testHarnessRuns() {
        XCTAssertEqual(2 + 2, 4)
    }
}
```

- [ ] **Step 2: Add a `BoxBoxNowTests` unit-test target to `project.pbxproj`**

Add a `PBXNativeTarget` of productType `com.apple.product-type.bundle.unit-test` named `BoxBoxNowTests`, host application `BoxBoxNow`, with a `PBXFileSystemSynchronizedRootGroup` pointing at `BoxBoxNowTests/` (Xcode 16+ synced group, matching how the app target's sources are organized), a Sources build phase, the `XCTest` framework, and a matching scheme entry. Keep `IPHONEOS_DEPLOYMENT_TARGET` and Swift version aligned with the app target.

- [ ] **Step 3: Verify the target builds and the trivial test runs**

Run: `xcodebuild test -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNow -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:BoxBoxNowTests/CrossTrackTests/testHarnessRuns`
Expected: `** TEST SUCCEEDED **`.

> If wiring the target via `project.pbxproj` proves unreliable, escalate (BLOCKED) — do not silently skip tests. As an interim algorithm check only, the pure helper from Task 2 can be compiled standalone (`swiftc` a copy + asserts), but the synced test target is the deliverable.

- [ ] **Step 4: Commit**
```bash
git add BoxBoxNow/BoxBoxNowTests/CrossTrackTests.swift BoxBoxNow/BoxBoxNow.xcodeproj/project.pbxproj
git commit -m "test(ios): add BoxBoxNowTests unit-test target"
```

---

## Task 2: iOS `GeoUtils.crossTrackProjection`

**Files:**
- Modify: `BoxBoxNow/BoxBoxNow/Utilities/GeoUtils.swift`
- Test: `BoxBoxNow/BoxBoxNowTests/CrossTrackTests.swift`

- [ ] **Step 1: Write failing tests**

Append to `CrossTrackTests.swift`:
```swift
final class CrossTrackProjectionTests: XCTestCase {
    // Segment from (0,0) to (0, 0.001) — runs east ~111m at the equator.
    func testFootAtMidpoint() {
        let r = GeoUtils.crossTrackProjection(
            pLat: 0, pLon: 0.0005, aLat: 0, aLon: 0, bLat: 0, bLon: 0.001)
        XCTAssertEqual(r.t, 0.5, accuracy: 0.02)
        XCTAssertLessThan(r.perpMeters, 0.5)
    }
    func testPerpendicularOffset() {
        // Point 0.00005 deg north of the midpoint ≈ 5.57m perpendicular.
        let r = GeoUtils.crossTrackProjection(
            pLat: 0.00005, pLon: 0.0005, aLat: 0, aLon: 0, bLat: 0, bLon: 0.001)
        XCTAssertEqual(r.t, 0.5, accuracy: 0.02)
        XCTAssertEqual(r.perpMeters, 5.566, accuracy: 0.3)
    }
    func testClampBeyondEnd() {
        let r = GeoUtils.crossTrackProjection(
            pLat: 0, pLon: 0.002, aLat: 0, aLon: 0, bLat: 0, bLon: 0.001)
        XCTAssertEqual(r.t, 1.0, accuracy: 1e-9)
    }
    func testDegenerateSegment() {
        let r = GeoUtils.crossTrackProjection(
            pLat: 0, pLon: 0.0005, aLat: 0, aLon: 0, bLat: 0, bLon: 0)
        XCTAssertEqual(r.t, 0.0, accuracy: 1e-9)
        XCTAssertGreaterThan(r.perpMeters, 1.0)
    }
}
```

- [ ] **Step 2: Run to verify failure** — `xcodebuild test ... -only-testing:BoxBoxNowTests/CrossTrackProjectionTests`. Expected: compile error (`crossTrackProjection` undefined).

- [ ] **Step 3: Implement the helper**

Add to `enum GeoUtils` in `GeoUtils.swift` (reuses the existing `degToMLat` / `degToMLon(at:)`):
```swift
/// Projects point p onto the segment a→b in local flat-earth meters.
/// Returns the clamped fraction `t` (0…1) of the nearest point along the
/// segment (the perpendicular foot) and the perpendicular distance in
/// meters from p to that foot. Accurate for kart-scale (~1 km) circuits.
static func crossTrackProjection(
    pLat: Double, pLon: Double,
    aLat: Double, aLon: Double,
    bLat: Double, bLon: Double
) -> (t: Double, perpMeters: Double) {
    let mLon = degToMLon(at: (aLat + bLat) / 2)
    let px = (pLat - aLat) * degToMLat, py = (pLon - aLon) * mLon
    let bx = (bLat - aLat) * degToMLat, by = (bLon - aLon) * mLon
    let len2 = bx * bx + by * by
    if len2 < 1e-9 {
        return (0, (px * px + py * py).squareRoot())
    }
    var t = (px * bx + py * by) / len2
    t = min(1, max(0, t))
    let dx = px - t * bx, dy = py - t * by
    return (t, (dx * dx + dy * dy).squareRoot())
}
```

- [ ] **Step 4: Run to verify pass** — Expected: 4 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add BoxBoxNow/BoxBoxNow/Utilities/GeoUtils.swift BoxBoxNow/BoxBoxNowTests/CrossTrackTests.swift
git commit -m "feat(ios): GeoUtils.crossTrackProjection (perpendicular foot + distance)"
```

---

## Task 3: iOS `LapTracker` cross-track delta + projected lap + smoothing

**Files:**
- Modify: `BoxBoxNow/BoxBoxNow/Services/LapTracker.swift`
- Test: `BoxBoxNow/BoxBoxNowTests/LapTrackerDeltaTests.swift` (create)

Replaces `computeDeltas()`/`interpolateDelta(...)` (lines 232-292) with cross-track. Adds `@Published var projectedLapMs`, two monotonic anchors, and two 10-sample smoothing buffers.

- [ ] **Step 1: Write failing tests**

`BoxBoxNow/BoxBoxNowTests/LapTrackerDeltaTests.swift`:
```swift
import XCTest
@testable import BoxBoxNow

final class LapTrackerDeltaTests: XCTestCase {
    // Build a straight east-running reference lap: 200 points over 0.001 deg,
    // 1 sample / 0.02s. Speed constant → time linear in distance.
    private func straightRef(offsetSec: Double = 0) -> LapTracker.LapRecord {
        let n = 200
        var dists = [Double](), times = [Double](), pos = [(lat: Double, lon: Double)]()
        for i in 0..<n {
            let f = Double(i) / Double(n - 1)
            dists.append(f * 111.0)                 // ~111 m
            times.append(offsetSec + f * 4.0)       // 4 s lap
            pos.append((lat: 0, lon: f * 0.001))
        }
        return LapTracker.LapRecord(
            lapNumber: 1, durationMs: 4000, totalDistanceM: 111, maxSpeedKmh: 100,
            distances: dists, timestamps: times, positions: pos,
            speeds: [], gforceLat: [], gforceLon: [])
    }

    func testZeroDeltaWhenOnReference() {
        let lt = LapTracker()
        lt.setBestLapForTest(straightRef())
        // Point at f≈0.25 (lon 0.00025), within the fwd window of anchor 0.
        // Reference time there is 1.0 s, so elapsed 1.0 s ⇒ delta ≈ 0.
        let d = lt.crossTrackDeltaForTest(lat: 0, lon: 0.00025, currentElapsedMs: 1000)
        XCTAssertNotNil(d)
        XCTAssertEqual(d!.delta, 0, accuracy: 80) // within ~1 sample of jitter
    }

    func testPositiveDeltaWhenSlower() {
        let lt = LapTracker()
        lt.setBestLapForTest(straightRef())
        let d = lt.crossTrackDeltaForTest(lat: 0, lon: 0.00025, currentElapsedMs: 1300)
        XCTAssertEqual(d!.delta, 300, accuracy: 80)
    }

    func testLateralOffsetSameTimeIsNearZero() {
        // Different racing line (5 m to the side) at the same pace → delta ≈ 0,
        // the whole point of cross-track over distance-interpolation.
        let lt = LapTracker()
        lt.setBestLapForTest(straightRef())
        let d = lt.crossTrackDeltaForTest(lat: 0.00005, lon: 0.00025, currentElapsedMs: 1000)
        XCTAssertEqual(d!.delta, 0, accuracy: 100)
    }

    func testNilWhenOffTrack() {
        let lt = LapTracker()
        lt.setBestLapForTest(straightRef())
        // 60 m north of the line → beyond maxPerpM (25 m).
        let d = lt.crossTrackDeltaForTest(lat: 0.00054, lon: 0.00025, currentElapsedMs: 1000)
        XCTAssertNil(d)
    }
}
```

- [ ] **Step 2: Run to verify failure** — Expected: compile error (test-only hooks + `projectedLapMs` undefined).

- [ ] **Step 3: Implement**

In `LapTracker.swift`:

(a) Add published state + private state near the existing `@Published` block / reference-lap section:
```swift
@Published var projectedLapMs: Double?

private static let searchFwd = 60
private static let searchBack = 20
private static let maxPerpM = 25.0
private static let smoothCap = 10

private var refAnchorBest = 0
private var refAnchorPrev = 0
private var bestSmoothBuf: [Double] = []
private var prevSmoothBuf: [Double] = []
```

(b) Add the smoothing helper + cross-track core:
```swift
private func smooth(_ buf: inout [Double], _ v: Double) -> Double {
    buf.append(v)
    if buf.count > Self.smoothCap { buf.removeFirst() }
    return buf.reduce(0, +) / Double(buf.count)
}

/// Cross-track delta vs a reference lap using a monotonic moving anchor.
/// Returns (rawDeltaMs, matchedSegmentIndex) or nil if no valid projection
/// (off the reference line, or no reference). Sign: + = behind reference.
private func crossTrackDelta(
    lat: Double, lon: Double, currentElapsedMs: Double,
    ref: LapRecord, anchor: Int
) -> (delta: Double, index: Int)? {
    let pos = ref.positions
    let n = pos.count
    guard n >= 2 else { return nil }
    var bestPerp = Double.greatestFiniteMagnitude
    var bestK = -1, bestT = 0.0
    func scan(_ lo: Int, _ hi: Int) {
        guard lo <= hi else { return }
        var k = lo
        while k <= hi {
            let r = GeoUtils.crossTrackProjection(
                pLat: lat, pLon: lon,
                aLat: pos[k].lat, aLon: pos[k].lon,
                bLat: pos[k + 1].lat, bLon: pos[k + 1].lon)
            if r.perpMeters < bestPerp { bestPerp = r.perpMeters; bestK = k; bestT = r.t }
            k += 1
        }
    }
    let a = min(max(0, anchor), n - 2)
    scan(a, min(n - 2, a + Self.searchFwd))
    if bestK < 0 || bestPerp > Self.maxPerpM {
        scan(max(0, a - Self.searchBack), a)
    }
    guard bestK >= 0, bestPerp <= Self.maxPerpM else { return nil }
    let t0 = ref.timestamps[0]
    let refTimeS = (ref.timestamps[bestK]
        + bestT * (ref.timestamps[bestK + 1] - ref.timestamps[bestK])) - t0
    return (currentElapsedMs - refTimeS * 1000, bestK)
}
```

(c) Replace `computeDeltas()` (and delete `interpolateDelta(...)`):
```swift
private func computeDeltas() {
    guard let start = lapStartTime, let last = lastSample, last.fixType >= 3 else {
        deltaBestMs = nil; deltaPrevMs = nil; projectedLapMs = nil
        bestSmoothBuf.removeAll(); prevSmoothBuf.removeAll()
        return
    }
    let elapsed = (last.timestamp - start) * 1000

    if let ref = bestLap,
       let r = crossTrackDelta(lat: last.lat, lon: last.lon,
                               currentElapsedMs: elapsed, ref: ref, anchor: refAnchorBest) {
        refAnchorBest = r.index
        let d = smooth(&bestSmoothBuf, r.delta)
        deltaBestMs = d
        projectedLapMs = ref.durationMs + d
    } else {
        deltaBestMs = nil; projectedLapMs = nil; bestSmoothBuf.removeAll()
    }

    if let ref = prevLap,
       let r = crossTrackDelta(lat: last.lat, lon: last.lon,
                               currentElapsedMs: elapsed, ref: ref, anchor: refAnchorPrev) {
        refAnchorPrev = r.index
        deltaPrevMs = smooth(&prevSmoothBuf, r.delta)
    } else {
        deltaPrevMs = nil; prevSmoothBuf.removeAll()
    }
}
```

(d) Reset anchors + buffers + `projectedLapMs` in `reset()`, `resetStintBest()`, and at the end of `completeLap()`:
```swift
// in reset():
refAnchorBest = 0; refAnchorPrev = 0
bestSmoothBuf.removeAll(); prevSmoothBuf.removeAll()
projectedLapMs = nil
// in resetStintBest():
refAnchorBest = 0; bestSmoothBuf.removeAll(); projectedLapMs = nil
// at end of completeLap() (next lap starts fresh):
refAnchorBest = 0; refAnchorPrev = 0
bestSmoothBuf.removeAll(); prevSmoothBuf.removeAll()
projectedLapMs = nil
```

(e) Add `#if DEBUG` test hooks at the end of the class:
```swift
#if DEBUG
func setBestLapForTest(_ r: LapRecord) { bestLap = r; refAnchorBest = 0; bestSmoothBuf.removeAll() }
func crossTrackDeltaForTest(lat: Double, lon: Double, currentElapsedMs: Double) -> (delta: Double, index: Int)? {
    guard let ref = bestLap else { return nil }
    return crossTrackDelta(lat: lat, lon: lon, currentElapsedMs: currentElapsedMs, ref: ref, anchor: refAnchorBest)
}
#endif
```

- [ ] **Step 4: Run to verify pass** — Expected: 4 `LapTrackerDeltaTests` PASS.

- [ ] **Step 5: Commit**
```bash
git add BoxBoxNow/BoxBoxNow/Services/LapTracker.swift BoxBoxNow/BoxBoxNowTests/LapTrackerDeltaTests.swift
git commit -m "feat(ios): cross-track GPS delta + projectedLapMs (replaces distance-interp)"
```

---

## Task 4: iOS `projectedLap` driver card

**Files:**
- Modify: `BoxBoxNow/BoxBoxNow/Models/DriverCard.swift`
- Modify: `BoxBoxNow/BoxBoxNow/Views/Driver/Cards/DriverCardView.swift`
- Modify: `BoxBoxNow/BoxBoxNow/Shared/Utilities/I18n.swift`

This is UI wiring; verify by building the app (`xcodebuild build`). No new unit test.

- [ ] **Step 1: Add the enum case + metadata in `DriverCard.swift`**
- After `case deltaBestLap` (line 88) add `case projectedLap`.
- `group` (line 101): add `.projectedLap` to the `.gps` case list.
- `requiresGPS` (lines 185-189): add `.projectedLap` to the `true` case.
- `iconName`: `case .projectedLap: return "flag.checkered"`.
- `sampleValue`: `case .projectedLap: return "1:01.45"`.
- `accentColor`: `case .projectedLap: return .cyan`.

- [ ] **Step 2: Add i18n label in `I18n.swift`** (after `card.gpsSpeed`, ~line 362):
```swift
"card.projectedLap": ["es": "Vuelta proyectada (GPS)", "en": "Projected lap (GPS)", "it": "Giro proiettato (GPS)", "de": "Projizierte Runde (GPS)", "fr": "Tour projeté (GPS)"],
```
(Match the exact dictionary/key shape used by the surrounding `card.*` entries.)

- [ ] **Step 3: Render the card in `DriverCardView.swift`**
- `cardLabel` switch (102-112): add `case .projectedLap` returning the localized label (use the same pattern as `.deltaBestLap`).
- `cardAccentColor` (170-180): add `case .projectedLap` colored by delta sign (green if `projectedLapMs <= bestLapMs`, else red) — mirror `.deltaBestLap` sign logic.
- `cardContent` (296-305): add `case .projectedLap` rendering a new `ProjectedLapContent`.
- Accessibility (987-996): add `case .projectedLap` → "Vuelta proyectada: …".

Add `ProjectedLapContent`, mirroring `DeltaBestLapContent` (1235-1289) but primary line = projected lap time, secondary = the live delta:
```swift
private struct ProjectedLapContent: View {
    @ObservedObject var lapTracker: LapTracker
    var body: some View {
        VStack(spacing: 2) {
            if let p = lapTracker.projectedLapMs {
                Text(Formatters.msToLapTime(p))
                    .font(.system(.title2, design: .monospaced)).bold()
                if let d = lapTracker.deltaBestMs {
                    Text((d < 0 ? "" : "+") + String(format: "%.2fs", d / 1000))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(d < 0 ? .green : .red)
                }
            } else {
                Text("--:--.---").font(.system(.title2, design: .monospaced))
                    .foregroundColor(Color(.systemGray))
            }
        }
    }
}
```
(Match the exact init/parameters of `DeltaBestLapContent` at the call site — pass `lapTracker` the same way.)

- [ ] **Step 4: Build** — `xcodebuild build -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNow -destination 'platform=iOS Simulator,name=iPhone 17'`. Expected: `BUILD SUCCEEDED`. Re-run the full `BoxBoxNowTests` suite to confirm no regressions.

- [ ] **Step 5: Commit**
```bash
git add BoxBoxNow/BoxBoxNow/Models/DriverCard.swift BoxBoxNow/BoxBoxNow/Views/Driver/Cards/DriverCardView.swift BoxBoxNow/BoxBoxNow/Shared/Utilities/I18n.swift
git commit -m "feat(ios): projectedLap driver card"
```

---

## Task 5: Android unit-test infrastructure

**Files:**
- Modify: `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`
- Create: `android/app/src/test/java/com/boxboxnow/app/util/CrossTrackTest.kt`

No `app/src/test/` and no `testImplementation` deps exist today.

- [ ] **Step 1: Add JUnit version + library to `libs.versions.toml`**
Under `[versions]`: `junit4 = "4.13.2"`. Under `[libraries]`: `junit4 = { group = "junit", name = "junit", version.ref = "junit4" }`.

- [ ] **Step 2: Add the test dependency in `app/build.gradle.kts`** (inside `dependencies { }`): `testImplementation(libs.junit4)`.

- [ ] **Step 3: Create a trivial test**
`android/app/src/test/java/com/boxboxnow/app/util/CrossTrackTest.kt`:
```kotlin
package com.boxboxnow.app.util

import org.junit.Assert.assertEquals
import org.junit.Test

class HarnessTest {
    @Test fun harnessRuns() { assertEquals(4, 2 + 2) }
}
```

- [ ] **Step 4: Verify** — `cd android && ./gradlew :app:testDebugUnitTest --tests "com.boxboxnow.app.util.HarnessTest"`. Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**
```bash
git add android/gradle/libs.versions.toml android/app/build.gradle.kts android/app/src/test/java/com/boxboxnow/app/util/CrossTrackTest.kt
git commit -m "test(android): add JUnit unit-test source set"
```

---

## Task 6: Android `GeoUtils.crossTrackProjection`

**Files:**
- Modify: `android/app/src/main/java/com/boxboxnow/app/util/GeoUtils.kt`
- Test: `android/app/src/test/java/com/boxboxnow/app/util/CrossTrackTest.kt`

- [ ] **Step 1: Write failing tests** (append to `CrossTrackTest.kt`):
```kotlin
class CrossTrackProjectionTest {
    @Test fun footAtMidpoint() {
        val (t, perp) = GeoUtils.crossTrackProjection(0.0, 0.0005, 0.0, 0.0, 0.0, 0.001)
        assertEquals(0.5, t, 0.02)
        assert(perp < 0.5)
    }
    @Test fun perpendicularOffset() {
        val (t, perp) = GeoUtils.crossTrackProjection(0.00005, 0.0005, 0.0, 0.0, 0.0, 0.001)
        assertEquals(0.5, t, 0.02)
        assertEquals(5.566, perp, 0.3)
    }
    @Test fun clampBeyondEnd() {
        val (t, _) = GeoUtils.crossTrackProjection(0.0, 0.002, 0.0, 0.0, 0.0, 0.001)
        assertEquals(1.0, t, 1e-9)
    }
    @Test fun degenerateSegment() {
        val (t, perp) = GeoUtils.crossTrackProjection(0.0, 0.0005, 0.0, 0.0, 0.0, 0.0)
        assertEquals(0.0, t, 1e-9)
        assert(perp > 1.0)
    }
}
```

- [ ] **Step 2: Run to verify failure** — `./gradlew :app:testDebugUnitTest --tests "com.boxboxnow.app.util.CrossTrackProjectionTest"`. Expected: unresolved reference `crossTrackProjection`.

- [ ] **Step 3: Implement** (add to `object GeoUtils`, reusing the existing `DEG_TO_M_LAT` / `degToMLon`):
```kotlin
/** Projects point p onto segment a→b in local flat-earth meters.
 * Returns (t, perpMeters): the clamped fraction along the segment of the
 * perpendicular foot, and the perpendicular distance in meters. */
fun crossTrackProjection(
    pLat: Double, pLon: Double,
    aLat: Double, aLon: Double,
    bLat: Double, bLon: Double,
): Pair<Double, Double> {
    val mLon = degToMLon((aLat + bLat) / 2)
    val px = (pLat - aLat) * DEG_TO_M_LAT; val py = (pLon - aLon) * mLon
    val bx = (bLat - aLat) * DEG_TO_M_LAT; val by = (bLon - aLon) * mLon
    val len2 = bx * bx + by * by
    if (len2 < 1e-9) return 0.0 to kotlin.math.sqrt(px * px + py * py)
    var t = (px * bx + py * by) / len2
    t = t.coerceIn(0.0, 1.0)
    val dx = px - t * bx; val dy = py - t * by
    return t to kotlin.math.sqrt(dx * dx + dy * dy)
}
```
> Confirm the exact names of the meters-per-degree constants/helpers in `GeoUtils.kt` (`DEG_TO_M_LAT`, `degToMLon`) and reuse them verbatim.

- [ ] **Step 4: Run to verify pass** — Expected: 4 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add android/app/src/main/java/com/boxboxnow/app/util/GeoUtils.kt android/app/src/test/java/com/boxboxnow/app/util/CrossTrackTest.kt
git commit -m "feat(android): GeoUtils.crossTrackProjection"
```

---

## Task 7: Android `LapTracker` cross-track delta + projected lap

**Files:**
- Modify: `android/app/src/main/java/com/boxboxnow/app/lap/LapTracker.kt`
- Test: `android/app/src/test/java/com/boxboxnow/app/lap/LapTrackerDeltaTest.kt` (create)

Mirror of Task 3. Replaces `computeDeltas()`/`interpolateDelta(...)` (lines 237-278).

- [ ] **Step 1: Write failing tests**
`android/app/src/test/java/com/boxboxnow/app/lap/LapTrackerDeltaTest.kt`:
```kotlin
package com.boxboxnow.app.lap

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Test

class LapTrackerDeltaTest {
    private fun straightRef(): LapTracker.LapRecord {
        val n = 200
        val d = ArrayList<Double>(); val t = ArrayList<Double>(); val p = ArrayList<Pair<Double, Double>>()
        for (i in 0 until n) {
            val f = i.toDouble() / (n - 1)
            d.add(f * 111.0); t.add(f * 4.0); p.add(0.0 to f * 0.001)
        }
        return LapTracker.LapRecord(1, 4000.0, 111.0, 100.0, d, t, p, emptyList(), emptyList(), emptyList())
    }

    // Points at f≈0.25 (lon 0.00025) fall inside the fwd window of anchor 0.
    @Test fun zeroDeltaWhenOnReference() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.0, 0.00025, 1000.0)
        assertNotNull(r); assertEquals(0.0, r!!.first, 80.0)
    }
    @Test fun positiveDeltaWhenSlower() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.0, 0.00025, 1300.0)
        assertEquals(300.0, r!!.first, 80.0)
    }
    @Test fun lateralOffsetSameTimeNearZero() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.00005, 0.00025, 1000.0)
        assertEquals(0.0, r!!.first, 100.0)
    }
    @Test fun nilWhenOffTrack() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.00054, 0.00025, 1000.0)
        assertNull(r)
    }
}
```

- [ ] **Step 2: Run to verify failure** — Expected: unresolved `crossTrackDeltaForTest` / `projectedLapMs`.

- [ ] **Step 3: Implement** in `LapTracker.kt`:

(a) Add state after `_deltaPrevMs` (line 54) and the reference section (line 73):
```kotlin
private val _projectedLapMs = MutableStateFlow<Double?>(null)
val projectedLapMs = _projectedLapMs.asStateFlow()

private var refAnchorBest = 0
private var refAnchorPrev = 0
private val bestSmoothBuf = ArrayDeque<Double>()
private val prevSmoothBuf = ArrayDeque<Double>()
```
And a companion object with the shared constants + the pure-function test hook:
```kotlin
companion object {
    private const val SEARCH_FWD = 60
    private const val SEARCH_BACK = 20
    private const val MAX_PERP_M = 25.0
    private const val SMOOTH_CAP = 10

    /** Pure cross-track delta against a reference lap. Returns (deltaMs, segmentIndex)
     *  or null if no valid projection. Sign: + = behind reference. */
    fun crossTrackDelta(ref: LapRecord, lat: Double, lon: Double, currentElapsedMs: Double, anchor: Int): Pair<Double, Int>? {
        val pos = ref.positions
        val n = pos.size
        if (n < 2) return null
        var bestPerp = Double.MAX_VALUE; var bestK = -1; var bestT = 0.0
        fun scan(lo: Int, hi: Int) {
            var k = lo
            while (k in 0..hi && k < n - 1) {
                val (t, perp) = GeoUtils.crossTrackProjection(
                    lat, lon, pos[k].first, pos[k].second, pos[k + 1].first, pos[k + 1].second)
                if (perp < bestPerp) { bestPerp = perp; bestK = k; bestT = t }
                k++
            }
        }
        val a = anchor.coerceIn(0, n - 2)
        scan(a, minOf(n - 2, a + SEARCH_FWD))
        if (bestK < 0 || bestPerp > MAX_PERP_M) scan(maxOf(0, a - SEARCH_BACK), a)
        if (bestK < 0 || bestPerp > MAX_PERP_M) return null
        val t0 = ref.timestamps[0]
        val refTimeS = (ref.timestamps[bestK] + bestT * (ref.timestamps[bestK + 1] - ref.timestamps[bestK])) - t0
        return (currentElapsedMs - refTimeS * 1000) to bestK
    }

    // Test hook (pure; no instance state).
    fun crossTrackDeltaForTest(ref: LapRecord, lat: Double, lon: Double, elapsedMs: Double) =
        crossTrackDelta(ref, lat, lon, elapsedMs, 0)
}
```

(b) Smoothing helper (instance method):
```kotlin
private fun smooth(buf: ArrayDeque<Double>, v: Double): Double {
    buf.addLast(v)
    while (buf.size > SMOOTH_CAP) buf.removeFirst()
    return buf.sum() / buf.size
}
```

(c) Replace `computeDeltas()` (delete `interpolateDelta`):
```kotlin
private fun computeDeltas() {
    val start = lapStartTime; val last = lastSample
    if (start == null || last == null || last.fixType < 3) {
        _deltaBestMs.value = null; _deltaPrevMs.value = null; _projectedLapMs.value = null
        bestSmoothBuf.clear(); prevSmoothBuf.clear(); return
    }
    val elapsed = (last.timestamp - start) * 1000

    val b = bestLap
    val rb = if (b != null) crossTrackDelta(b, last.lat, last.lon, elapsed, refAnchorBest) else null
    if (b != null && rb != null) {
        refAnchorBest = rb.second
        val d = smooth(bestSmoothBuf, rb.first)
        _deltaBestMs.value = d
        _projectedLapMs.value = b.durationMs + d
    } else {
        _deltaBestMs.value = null; _projectedLapMs.value = null; bestSmoothBuf.clear()
    }

    val p = prevLap
    val rp = if (p != null) crossTrackDelta(p, last.lat, last.lon, elapsed, refAnchorPrev) else null
    if (p != null && rp != null) {
        refAnchorPrev = rp.second
        _deltaPrevMs.value = smooth(prevSmoothBuf, rp.first)
    } else {
        _deltaPrevMs.value = null; prevSmoothBuf.clear()
    }
}
```

(d) Reset anchors/buffers/`_projectedLapMs` in `reset()` (line 120), `resetStintBest()` (line 145), end of `completeLap()` (line 230):
```kotlin
// reset(): refAnchorBest = 0; refAnchorPrev = 0; bestSmoothBuf.clear(); prevSmoothBuf.clear(); _projectedLapMs.value = null
// resetStintBest(): refAnchorBest = 0; bestSmoothBuf.clear(); _projectedLapMs.value = null
// end of completeLap(): refAnchorBest = 0; refAnchorPrev = 0; bestSmoothBuf.clear(); prevSmoothBuf.clear(); _projectedLapMs.value = null
```

- [ ] **Step 4: Run to verify pass** — `./gradlew :app:testDebugUnitTest --tests "com.boxboxnow.app.lap.LapTrackerDeltaTest"`. Expected: 4 PASS.

- [ ] **Step 5: Commit**
```bash
git add android/app/src/main/java/com/boxboxnow/app/lap/LapTracker.kt android/app/src/test/java/com/boxboxnow/app/lap/LapTrackerDeltaTest.kt
git commit -m "feat(android): cross-track GPS delta + projectedLapMs"
```

---

## Task 8: Android `projectedLap` driver card

**Files:**
- Modify: `android/app/src/main/java/com/boxboxnow/app/models/DriverCard.kt`
- Modify: `android/app/src/main/java/com/boxboxnow/app/i18n/Translations.kt`
- Modify: `android/app/src/main/java/com/boxboxnow/app/ui/.../DriverCardView.kt`
- Modify: `android/app/src/main/java/com/boxboxnow/app/ui/.../DriverScreen.kt`

UI wiring; verify by `./gradlew :app:assembleDebug`.

- [ ] **Step 1: Add the enum + metadata in `DriverCard.kt`** — after `GpsLapDelta` (line 100): `ProjectedLap("projectedLap", "Vuelta proyectada (GPS)", "1:01.45")`. Add `ProjectedLap` to the `.GPS` `group` case (line 108), to `requiresGPS` true (lines 114-117), to `accent` → `Color(0xFF00BCD4)` (cyan), and `iconMaterial` → `Icons.Filled.Flag` (or the project's checkered-flag equivalent).

- [ ] **Step 2: Translation in `Translations.kt`** — after `card.gpsLapDelta` (line 386):
```kotlin
"card.projectedLap" to mapOf(Language.ES to "Vuelta proyectada (GPS)", Language.EN to "Projected lap (GPS)", Language.IT to "Giro proiettato (GPS)", Language.DE to "Projizierte Runde (GPS)", Language.FR to "Tour projeté (GPS)"),
```

- [ ] **Step 3: Render in `DriverCardView.kt`** — add `projectedLapMs: Double?` to the `DriverCardView` (line ~70-85) and `CardContent` (line ~376-396) signatures, pass it through (line ~183). Add a `when(card)` arm after `GpsLapDelta` (lines 546-558):
```kotlin
DriverCard.ProjectedLap -> {
    if (gps == null) Text("GPS --", color = BoxBoxNowColors.SystemGray4, fontSize = (16f * scale).sp)
    else if (projectedLapMs != null) MonoValue(Formatters.msToLapTime(projectedLapMs), BoxBoxNowColors.Cyan, mainFont)
    else MonoValue("--:--.---", BoxBoxNowColors.SystemGray, mainFont)
}
```
(Use the project's existing lap-time formatter; confirm its name.)

- [ ] **Step 4: Wire call sites in `DriverScreen.kt`** — at both `DriverCardView(...)` call sites (lines ~565-579 and ~598-609), collect `projectedLapMs` from the LapTracker StateFlow the same way `deltaBestMs` is collected, and pass `projectedLapMs = projectedLapMs`.

- [ ] **Step 5: Build + full test run** — `cd android && ./gradlew :app:assembleDebug :app:testDebugUnitTest`. Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 6: Commit**
```bash
git add android/app/src/main/java/com/boxboxnow/app/models/DriverCard.kt android/app/src/main/java/com/boxboxnow/app/i18n/Translations.kt android/app/src/main/java/com/boxboxnow/app/ui
git commit -m "feat(android): projectedLap driver card"
```

---

## Task 9: Web + backend card catalog

**Files:**
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/src/hooks/useDriverConfig.ts` (or its actual path)
- Modify: `backend/app/.../driver_cards.py`
- Test: `backend/tests/test_register_user_preferences.py` (existing — self-validates)

The card catalog is mirrored to web + backend. No schema change: `visible_cards`/`card_order` are JSON/`list[str]`.

- [ ] **Step 1: Backend — add the id (failing test first)**
Run the existing test to confirm current state: `cd backend && pytest tests/test_register_user_preferences.py -q` (passes today). Add `"projectedLap"` to `ALL_DRIVER_CARD_IDS` in `driver_cards.py` after `"gpsLapDelta"` (GPS section). The existing test auto-asserts the new id is seeded to `False` for new users.

- [ ] **Step 2: Run backend test** — `pytest tests/test_register_user_preferences.py -q`. Expected: PASS (new id included automatically).

- [ ] **Step 3: Web i18n** — in `frontend/src/lib/i18n.ts`, after `"card.kartTier"`:
```ts
"card.projectedLap": { es: "Vuelta proyectada (GPS)", en: "Projected lap (GPS)", it: "Giro proiettato (GPS)", de: "Projizierte Runde (GPS)", fr: "Tour projeté (GPS)" },
```

- [ ] **Step 4: Web catalog** — in `useDriverConfig.ts`: add `| "projectedLap"` to the `DriverCardId` union (GPS section) and the entry to `ALL_DRIVER_CARDS` after `gpsLapDelta`:
```ts
{ id: "projectedLap", labelKey: "card.projectedLap", label: "Vuelta proyectada (GPS)", requiresGps: true, group: "gps" },
```

- [ ] **Step 5: Typecheck web** — `cd frontend && npm run build` (or `tsc --noEmit`). Expected: no type errors.

- [ ] **Step 6: Commit**
```bash
git add backend/app frontend/src/lib/i18n.ts frontend/src/hooks/useDriverConfig.ts
git commit -m "feat(catalog): projectedLap card id + labels (web + backend)"
```

---

## Final review

After all tasks: run the full iOS test suite (`xcodebuild test ... -only-testing:BoxBoxNowTests`), the full Android unit tests (`./gradlew :app:testDebugUnitTest`), backend `pytest tests/test_register_user_preferences.py`, and web `npm run build`. Confirm the acceptance criteria from the spec: on-reference delta ≈ 0 with no end-of-lap drift; lateral-offset-same-pace delta ≈ 0; smoothed value + projected lap visible; iOS and Android produce the same delta for the same synthetic input. Then use superpowers:finishing-a-development-branch.
