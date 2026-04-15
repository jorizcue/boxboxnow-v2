import XCTest
@testable import BoxBoxNowDashboard

final class RaceFormattersTests: XCTestCase {

    func test_lapTime_formatsSubMinute() {
        XCTAssertEqual(RaceFormatters.lapTime(ms: 52_345), "52.345")
    }

    func test_lapTime_formatsMinuteAndSeconds() {
        XCTAssertEqual(RaceFormatters.lapTime(ms: 61_004), "1:01.004")
    }

    func test_lapTime_returnsDashForNil() {
        XCTAssertEqual(RaceFormatters.lapTime(ms: nil), "—")
    }

    func test_lapTime_returnsDashForNonPositive() {
        XCTAssertEqual(RaceFormatters.lapTime(ms: 0), "—")
        XCTAssertEqual(RaceFormatters.lapTime(ms: -10), "—")
    }

    func test_position_appendsOrdinal() {
        XCTAssertEqual(RaceFormatters.position(1), "1º")
        XCTAssertEqual(RaceFormatters.position(10), "10º")
    }

    func test_stint_formatsMinutesSeconds() {
        XCTAssertEqual(RaceFormatters.stint(elapsedMs: 125_000), "2:05")
    }

    func test_stint_zero() {
        XCTAssertEqual(RaceFormatters.stint(elapsedMs: 0), "0:00")
    }

    func test_stint_returnsDashForNil() {
        XCTAssertEqual(RaceFormatters.stint(elapsedMs: nil), "—")
    }

    func test_stint_returnsDashForNegative() {
        XCTAssertEqual(RaceFormatters.stint(elapsedMs: -1), "—")
    }
}
