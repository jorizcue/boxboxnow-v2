import XCTest
@testable import BoxBoxNowDashboard

final class JSONValueTests: XCTestCase {
    func testDecodesPrimitives() throws {
        let json = #"{"s":"hi","i":42,"d":3.14,"b":true,"n":null}"#.data(using: .utf8)!
        let v = try JSONDecoder().decode([String: JSONValue].self, from: json)
        XCTAssertEqual(v["s"], .string("hi"))
        XCTAssertEqual(v["i"], .int(42))
        XCTAssertEqual(v["d"], .double(3.14))
        XCTAssertEqual(v["b"], .bool(true))
        XCTAssertEqual(v["n"], .null)
    }

    func testDecodesNestedArrayAndObject() throws {
        let json = #"{"arr":[1,"x",true],"obj":{"k":"v"}}"#.data(using: .utf8)!
        let v = try JSONDecoder().decode([String: JSONValue].self, from: json)
        if case let .array(items) = v["arr"] {
            XCTAssertEqual(items, [.int(1), .string("x"), .bool(true)])
        } else { XCTFail("expected array") }

        if case let .object(dict) = v["obj"] {
            XCTAssertEqual(dict["k"], .string("v"))
        } else { XCTFail("expected object") }
    }

    func testEncodesRoundTrip() throws {
        let original: JSONValue = .object([
            "x": .int(1),
            "y": .array([.bool(false), .string("z")])
        ])
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testSubscripts() {
        let v: JSONValue = .object(["a": .object(["b": .int(7)])])
        XCTAssertEqual(v["a"]?["b"], .int(7))
        XCTAssertNil(v["missing"])
    }

    // MARK: - Behavior pins

    /// Pins the "whole-number double collapses to .int" behavior documented
    /// in the JSONValue type comment. If this test starts failing, someone
    /// either reordered the decode attempts or added raw-string preservation
    /// — both require updating the doc comment on JSONValue.
    func testWholeNumberDoubleRoundTripsAsInt() throws {
        let original: JSONValue = .double(3.0)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        // Wire-indistinguishable from .int(3); decode lands in the Int branch.
        XCTAssertEqual(decoded, .int(3))

        // doubleValue accessor still works: coerces .int back to Double.
        XCTAssertEqual(decoded.doubleValue, 3.0)
    }

    func testBoolDecodesBeforeInt() throws {
        // JSON `true` must become .bool(true), not .int(1). Pinned so the
        // decode order never gets reshuffled accidentally.
        let json = "true".data(using: .utf8)!
        let v = try JSONDecoder().decode(JSONValue.self, from: json)
        XCTAssertEqual(v, .bool(true))
    }

    /// `intValue` must NOT trap on non-finite or out-of-range doubles.
    /// `Int(d)` itself traps on `.nan`, `.infinity`, `-.infinity`, and
    /// values outside `Int.min...Int.max` — if we ever drop the guard,
    /// a malformed payload would crash the dashboard.
    func testIntValueReturnsNilForNonFiniteDoubles() {
        XCTAssertNil(JSONValue.double(.nan).intValue)
        XCTAssertNil(JSONValue.double(.infinity).intValue)
        XCTAssertNil(JSONValue.double(-.infinity).intValue)
        XCTAssertNil(JSONValue.double(1e300).intValue)
        XCTAssertNil(JSONValue.double(-1e300).intValue)
    }

    func testIntValueTruncatesFiniteInRangeDouble() {
        XCTAssertEqual(JSONValue.double(3.9).intValue, 3)
        XCTAssertEqual(JSONValue.double(-2.5).intValue, -2)
        XCTAssertEqual(JSONValue.double(0.0).intValue, 0)
    }

    /// Pinning test for the upper-bound trap edge. `Double(Int.max)` is
    /// actually `2^63` (Int.max = 2^63-1 isn't exactly representable as a
    /// Double and rounds up), so a `d` exactly equal to `Double(Int.max)`
    /// overflows when passed through `Int(d)`. The guard uses strict `<`
    /// to exclude this value; if someone ever relaxes it to `<=`, this
    /// test starts trapping.
    func testIntValueReturnsNilAtIntMaxDoubleBoundary() {
        XCTAssertNil(JSONValue.double(Double(Int.max)).intValue)
    }

    /// Lower bound: `Double(Int.min) == -2^63`, which IS exactly
    /// representable, so the guard uses `>=` and this value is valid.
    func testIntValueAcceptsIntMinDoubleBoundary() {
        XCTAssertEqual(JSONValue.double(Double(Int.min)).intValue, Int.min)
    }
}
