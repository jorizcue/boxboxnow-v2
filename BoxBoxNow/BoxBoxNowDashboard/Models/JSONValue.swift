import Foundation

/// Flexible JSON value for payloads whose shape varies per subtype (e.g. WS
/// update events). Decodes any JSON scalar, array, or object into a
/// strongly-typed enum without dropping data.
///
/// # Whole-number-double lossiness
///
/// The decode-attempt order is Bool → Int → Double → String → Array → Object.
/// JSON has a single numeric type, so `3` and `3.0` are wire-indistinguishable.
/// As a result, `.double(3.0)` encoded through `JSONEncoder` emits `3`, which
/// decodes back as `.int(3)`. Round-trip of whole-number doubles collapses
/// the case tag. This is intentional and pinned by
/// `JSONValueTests.testWholeNumberDoubleRoundTripsAsInt`.
///
/// If you need to preserve "this was a Double", don't rely on the enum case
/// alone — use `doubleValue`, which coerces `.int` to `Double` transparently.
enum JSONValue: Codable, Equatable, Hashable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unknown JSON value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    subscript(key: String) -> JSONValue? {
        if case let .object(dict) = self { return dict[key] }
        return nil
    }

    subscript(index: Int) -> JSONValue? {
        if case let .array(arr) = self, arr.indices.contains(index) { return arr[index] }
        return nil
    }

    var stringValue: String? {
        if case let .string(s) = self { return s } else { return nil }
    }

    /// Returns the value as an `Int` if the enum is `.int`, or if it is a
    /// finite `.double` whose truncated value fits in `Int`. Returns `nil` for
    /// `.nan`, `.infinity`, or doubles outside the representable `Int` range
    /// instead of trapping (`Int(d)` traps on non-finite / out-of-range inputs).
    ///
    /// Note on the upper bound: `Double(Int.max)` is `2^63`, NOT `Int.max`
    /// (which is `2^63 - 1`) — `Int.max` isn't exactly representable as a
    /// `Double`, so the cast rounds up. That means a `d` exactly equal to
    /// `Double(Int.max)` is actually `2^63`, which overflows when passed
    /// through `Int(d)`. The upper bound therefore uses strict `<`, not `<=`.
    /// The lower bound uses `>=` because `Double(Int.min)` IS exactly `-2^63`.
    var intValue: Int? {
        switch self {
        case let .int(i):
            return i
        case let .double(d):
            guard d.isFinite,
                  d >= Double(Int.min),
                  d < Double(Int.max) else { return nil }
            return Int(d)
        default:
            return nil
        }
    }

    var doubleValue: Double? {
        switch self {
        case let .double(d): return d
        case let .int(i):    return Double(i)
        default:             return nil
        }
    }

    var boolValue: Bool? {
        if case let .bool(b) = self { return b } else { return nil }
    }
}
