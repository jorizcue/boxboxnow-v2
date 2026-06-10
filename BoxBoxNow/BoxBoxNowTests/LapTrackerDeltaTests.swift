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
