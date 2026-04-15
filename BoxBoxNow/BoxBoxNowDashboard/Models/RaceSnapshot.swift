import Foundation

struct RaceSnapshot: Codable, Hashable {
    var raceStarted: Bool
    var raceFinished: Bool?
    var countdownMs: Double
    var trackName: String
    var karts: [KartStateFull]
    var fifo: FifoState
    var classification: [ClassificationEntry]
    var config: RaceConfig
    var durationMs: Double
}
