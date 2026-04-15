import Foundation

enum WsMessageType: String, Codable {
    case snapshot
    case update
    case analytics
    case fifoUpdate = "fifo_update"
    case replayStatus = "replay_status"
    case teamsUpdated = "teams_updated"
    case boxCall = "box_call"
}

struct WsMessage: Codable {
    let type: WsMessageType
    let data: WsMessageData?
    let events: [WsUpdateEvent]?
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
