import Foundation

/// A circuit recording directory containing dated log files.
struct RecordingCircuit: Codable, Identifiable, Hashable {
    let circuitDir: String
    let circuitName: String
    let circuitId: Int?
    let dates: [String] // "YYYY-MM-DD", reverse-sorted by server

    var id: String { circuitDir }

    enum CodingKeys: String, CodingKey {
        case circuitDir = "circuit_dir"
        case circuitName = "circuit_name"
        case circuitId = "circuit_id"
        case dates
    }
}

/// Analysis of a single log file: total blocks and race-start positions.
/// Note: the backend sends camelCase keys (totalBlocks, raceStarts, etc.)
/// which already match Swift's property names — no CodingKeys needed.
struct LogAnalysis: Codable, Hashable {
    let totalBlocks: Int
    let raceStarts: [RaceStartMarker]
    let startTime: String?
    let endTime: String?
}

/// A detected race-start point within a log file.
struct RaceStartMarker: Codable, Identifiable, Hashable {
    let block: Int
    let progress: Double
    let timestamp: String
    let title: String

    var id: Int { block }
}
