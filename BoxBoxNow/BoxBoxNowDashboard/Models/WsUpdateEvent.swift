import Foundation

struct WsUpdateEvent: Codable, Hashable {
    var event: String
    var rowId: String?
    var kartNumber: Int?
    var extra: [String: JSONValue]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: AnyCodingKey.self)
        self.event = try container.decode(String.self, forKey: AnyCodingKey("event"))
        self.rowId = try container.decodeIfPresent(String.self, forKey: AnyCodingKey("rowId"))
        self.kartNumber = try container.decodeIfPresent(Int.self, forKey: AnyCodingKey("kartNumber"))

        var extra: [String: JSONValue] = [:]
        for key in container.allKeys where !["event", "rowId", "kartNumber"].contains(key.stringValue) {
            extra[key.stringValue] = try container.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: AnyCodingKey.self)
        try container.encode(event, forKey: AnyCodingKey("event"))
        try container.encodeIfPresent(rowId, forKey: AnyCodingKey("rowId"))
        try container.encodeIfPresent(kartNumber, forKey: AnyCodingKey("kartNumber"))
        for (k, v) in extra {
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
