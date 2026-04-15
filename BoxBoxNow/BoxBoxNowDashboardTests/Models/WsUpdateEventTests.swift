import XCTest
@testable import BoxBoxNowDashboard

final class WsUpdateEventTests: XCTestCase {
    func testDecodesKnownKeysAndExtra() throws {
        let json = #"""
        {
          "event": "kart_update",
          "rowId": "k-7",
          "kartNumber": 7,
          "lapTime": 88345,
          "note": "fastest lap"
        }
        """#.data(using: .utf8)!

        let e = try JSONDecoder().decode(WsUpdateEvent.self, from: json)
        XCTAssertEqual(e.event, "kart_update")
        XCTAssertEqual(e.rowId, "k-7")
        XCTAssertEqual(e.kartNumber, 7)
        XCTAssertEqual(e.extra["lapTime"], .int(88345))
        XCTAssertEqual(e.extra["note"], .string("fastest lap"))
        // Strongly-typed fields must not leak into extra.
        XCTAssertNil(e.extra["event"])
        XCTAssertNil(e.extra["rowId"])
        XCTAssertNil(e.extra["kartNumber"])
    }

    /// If a caller mutates `extra` after construction to include a colliding
    /// key (e.g. `extra["event"] = ...`), encode must NOT emit duplicate
    /// keys — the strongly-typed field wins. Pinned so the filter in
    /// `encode(to:)` can't silently regress.
    ///
    /// WsUpdateEvent has a custom `init(from:)` in the struct body, which
    /// suppresses memberwise-init synthesis, so the fixture is built by
    /// decoding from JSON and then mutating the copy.
    func testEncodeFiltersExtraAgainstKnownKeys() throws {
        let seedJson = #"{"event":"x"}"#.data(using: .utf8)!
        var e = try JSONDecoder().decode(WsUpdateEvent.self, from: seedJson)
        XCTAssertEqual(e.event, "x")

        e.extra["event"]      = .string("hijack")
        e.extra["rowId"]      = .string("r-hijack")
        e.extra["kartNumber"] = .int(999)
        e.extra["safe"]       = .string("kept")

        let data = try JSONEncoder().encode(e)
        // Re-decode and confirm the strongly-typed fields survived untouched
        // and the collided-extras were not re-emitted.
        let roundTripped = try JSONDecoder().decode(WsUpdateEvent.self, from: data)
        XCTAssertEqual(roundTripped.event, "x")
        XCTAssertNil(roundTripped.rowId)
        XCTAssertNil(roundTripped.kartNumber)
        XCTAssertEqual(roundTripped.extra["safe"], .string("kept"))
        XCTAssertNil(roundTripped.extra["event"])
        XCTAssertNil(roundTripped.extra["rowId"])
        XCTAssertNil(roundTripped.extra["kartNumber"])
    }

    func testRoundTripPreservesExtra() throws {
        let seedJson = #"""
        {
          "event": "pit",
          "rowId": "k-3",
          "kartNumber": 3,
          "stintLaps": 18,
          "driver": "Ayrton"
        }
        """#.data(using: .utf8)!

        let original = try JSONDecoder().decode(WsUpdateEvent.self, from: seedJson)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(WsUpdateEvent.self, from: data)
        XCTAssertEqual(decoded.event, "pit")
        XCTAssertEqual(decoded.rowId, "k-3")
        XCTAssertEqual(decoded.kartNumber, 3)
        XCTAssertEqual(decoded.extra["stintLaps"], .int(18))
        XCTAssertEqual(decoded.extra["driver"], .string("Ayrton"))
    }
}
