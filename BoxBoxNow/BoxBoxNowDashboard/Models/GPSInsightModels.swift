import Foundation

// MARK: - Lap Summary (list endpoint — no trace data)

struct GPSLapSummary: Codable, Identifiable, Hashable {
    let id: Int
    let circuitId: Int?
    let raceSessionId: Int?
    let lapNumber: Int
    let durationMs: Double
    let totalDistanceM: Double
    let maxSpeedKmh: Double?
    let gpsSource: String?
    let recordedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case circuitId = "circuit_id"
        case raceSessionId = "race_session_id"
        case lapNumber = "lap_number"
        case durationMs = "duration_ms"
        case totalDistanceM = "total_distance_m"
        case maxSpeedKmh = "max_speed_kmh"
        case gpsSource = "gps_source"
        case recordedAt = "recorded_at"
    }
}

// MARK: - Lap Detail (single-lap endpoint — includes trace arrays)

struct GPSLapDetail: Codable, Identifiable {
    let id: Int
    let circuitId: Int?
    let lapNumber: Int
    let durationMs: Double
    let totalDistanceM: Double
    let maxSpeedKmh: Double?
    let gpsSource: String?
    let recordedAt: String?
    let distances: [Double]?
    let timestamps: [Double]?
    let positions: [GPSPosition]?
    let speeds: [Double]?
    let gforceLat: [Double]?
    let gforceLon: [Double]?

    enum CodingKeys: String, CodingKey {
        case id
        case circuitId = "circuit_id"
        case lapNumber = "lap_number"
        case durationMs = "duration_ms"
        case totalDistanceM = "total_distance_m"
        case maxSpeedKmh = "max_speed_kmh"
        case gpsSource = "gps_source"
        case recordedAt = "recorded_at"
        case distances, timestamps, positions, speeds
        case gforceLat = "gforce_lat"
        case gforceLon = "gforce_lon"
    }
}

// MARK: - GPS Position

struct GPSPosition: Codable, Hashable {
    let lat: Double
    let lon: Double
}

// MARK: - Aggregated Stats

struct GPSStats: Codable {
    let totalLaps: Int
    let bestLapMs: Double?
    let avgLapMs: Double?
    let topSpeedKmh: Double?
    let totalDistanceKm: Double

    enum CodingKeys: String, CodingKey {
        case totalLaps = "total_laps"
        case bestLapMs = "best_lap_ms"
        case avgLapMs = "avg_lap_ms"
        case topSpeedKmh = "top_speed_kmh"
        case totalDistanceKm = "total_distance_km"
    }
}
