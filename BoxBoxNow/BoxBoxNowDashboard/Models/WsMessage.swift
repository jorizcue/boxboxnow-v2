import Foundation

enum WsMessageType: String, Codable {
    case snapshot
    case update
    case analytics
    case fifoUpdate = "fifo_update"
    case replayStatus = "replay_status"
    case teamsUpdated = "teams_updated"
    case boxCall = "box_call"

    /// Catch-all for any server-emitted type we don't explicitly handle
    /// (e.g. `preset_default_changed`, future backend additions). Lets the
    /// whole frame decode succeed instead of being silently dropped by
    /// `JSONDecoder`, and the reducer can ignore it gracefully.
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = WsMessageType(rawValue: raw) ?? .unknown
    }
}

struct WsMessage: Codable {
    let type: WsMessageType
    let data: WsMessageData?
    let events: [WsUpdateEvent]?

    /// Lenient decoder: if `data` or `events` fail to decode (e.g. a newly-
    /// added non-optional field on `RaceConfig` that the iPad build doesn't
    /// know yet), we still yield the message with a nil payload instead of
    /// dropping the entire frame. This keeps the iPad connected and ticking
    /// even when the backend rolls out schema changes ahead of the client.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.type = (try? c.decode(WsMessageType.self, forKey: .type)) ?? .unknown
        self.data = try? c.decodeIfPresent(WsMessageData.self, forKey: .data)
        self.events = try? c.decodeIfPresent([WsUpdateEvent].self, forKey: .events)
    }

    enum CodingKeys: String, CodingKey { case type, data, events }
}

/// Union of possible `data` payloads. Only one of these is typically non-nil
/// per WS message. Decoded leniently so unknown fields don't throw.
struct WsMessageData: Codable {
    var raceStarted: Bool?
    var raceFinished: Bool?
    var countdownMs: Double?
    var trackName: String?
    var karts: [KartStateFull]?
    var fifo: FifoState?
    var classification: [ClassificationEntry]?
    var config: RaceConfig?
    var durationMs: Double?
    var teams: [Team]?
    var replayStatus: ReplayStatus?
}
