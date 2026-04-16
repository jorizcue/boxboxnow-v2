import Foundation

struct KartStats: Codable, Identifiable, Hashable {
    let kartNumber: Int
    let races: Int
    let totalLaps: Int
    let validLaps: Int
    let avgLapMs: Double
    let best5AvgMs: Double
    let bestLapMs: Int
    let teams: [String]

    var id: Int { kartNumber }

    enum CodingKeys: String, CodingKey {
        case kartNumber = "kart_number"
        case races
        case totalLaps = "total_laps"
        case validLaps = "valid_laps"
        case avgLapMs = "avg_lap_ms"
        case best5AvgMs = "best5_avg_ms"
        case bestLapMs = "best_lap_ms"
        case teams
    }
}

struct KartBestLap: Codable, Identifiable, Hashable {
    let lapTimeMs: Int
    let lapNumber: Int
    let teamName: String
    let driverName: String
    let raceDate: String
    let recordedAt: String

    var id: String { "\(raceDate)-\(driverName)-\(lapNumber)-\(lapTimeMs)" }

    enum CodingKeys: String, CodingKey {
        case lapTimeMs = "lap_time_ms"
        case lapNumber = "lap_number"
        case teamName = "team_name"
        case driverName = "driver_name"
        case raceDate = "race_date"
        case recordedAt = "recorded_at"
    }
}

struct KartDriver: Codable, Identifiable, Hashable {
    let teamName: String
    let driverName: String
    let displayName: String
    let totalLaps: Int
    let avgLapMs: Double
    let bestLapMs: Int

    var id: String { "\(teamName)-\(driverName)" }

    enum CodingKeys: String, CodingKey {
        case teamName = "team_name"
        case driverName = "driver_name"
        case displayName = "display_name"
        case totalLaps = "total_laps"
        case avgLapMs = "avg_lap_ms"
        case bestLapMs = "best_lap_ms"
    }
}
