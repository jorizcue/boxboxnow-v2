import Foundation

/// One entry in a WebSocket `update`-type message. The wire payload has a
/// strongly-typed `event` discriminator plus a few well-known keys
/// (`rowId`, `kartNumber`); everything else gets dropped into `extra` so
/// downstream consumers can peek at payloads they know about without us
/// having to model every possible event shape up front.
struct WsUpdateEvent: Codable, Hashable {
    var event: String
    var rowId: String?
    var kartNumber: Int?
    var extra: [String: JSONValue]

    /// Set of keys we decode into strongly-typed properties. Any key outside
    /// this set flows into `extra`. Kept in one place so `init(from:)` and
    /// `encode(to:)` can't drift out of sync when a new top-level field is
    /// added. Also used to filter `extra` on encode, so a caller who
    /// accidentally stuffs `"event"` into `extra` can't produce a
    /// duplicate-key JSON object — the strongly-typed field wins.
    private static let knownKeys: Set<String> = ["event", "rowId", "kartNumber"]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: AnyCodingKey.self)
        self.event = try container.decode(String.self, forKey: AnyCodingKey("event"))
        self.rowId = try container.decodeIfPresent(String.self, forKey: AnyCodingKey("rowId"))
        self.kartNumber = try container.decodeIfPresent(Int.self, forKey: AnyCodingKey("kartNumber"))

        var extra: [String: JSONValue] = [:]
        for key in container.allKeys where !Self.knownKeys.contains(key.stringValue) {
            extra[key.stringValue] = try container.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: AnyCodingKey.self)
        try container.encode(event, forKey: AnyCodingKey("event"))
        try container.encodeIfPresent(rowId, forKey: AnyCodingKey("rowId"))
        try container.encodeIfPresent(kartNumber, forKey: AnyCodingKey("kartNumber"))
        for (k, v) in extra where !Self.knownKeys.contains(k) {
            try container.encode(v, forKey: AnyCodingKey(k))
        }
    }
}

private struct AnyCodingKey: CodingKey {
    var stringValue: String
    init(_ s: String) { self.stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    var intValue: Int? { nil }
    init?(intValue: Int) { return nil }
}
