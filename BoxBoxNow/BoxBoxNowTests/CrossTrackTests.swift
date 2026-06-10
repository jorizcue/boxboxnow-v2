import XCTest
@testable import BoxBoxNow

final class CrossTrackTests: XCTestCase {
    func testHarnessRuns() {
        XCTAssertEqual(2 + 2, 4)
    }
}

final class CrossTrackProjectionTests: XCTestCase {
    func testFootAtMidpoint() {
        let r = GeoUtils.crossTrackProjection(
            pLat: 0, pLon: 0.0005, aLat: 0, aLon: 0, bLat: 0, bLon: 0.001)
        XCTAssertEqual(r.t, 0.5, accuracy: 0.02)
        XCTAssertLessThan(r.perpMeters, 0.5)
    }
    func testPerpendicularOffset() {
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
