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
}
