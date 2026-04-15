import Foundation

struct KartState: Identifiable, Codable {
    var id: String { rowId ?? "\(kartNumber)" }

    var rowId: String?
    var kartNumber: Int
    var position: Int
    var totalLaps: Int
    var lastLapMs: Double?
    var bestLapMs: Double?
    var avgLapMs: Double?
    var bestAvgMs: Double?
    var bestStintLapMs: Double?
    var gap: String?
    var interval: String?
    var pitCount: Int
    var pitStatus: String?
    var stintLapsCount: Int?
    var stintDurationS: Double?
    var stintElapsedMs: Double?
    var stintStartCountdownMs: Double?
    var stintStartTime: Double?
    var tierScore: Double?
    var driverName: String?
    var teamName: String?
    var driverDifferentialMs: Double?

    // Computed helpers
    var laps: Int { totalLaps }
    var isInPit: Bool { pitStatus == "in_pit" }
    var pitStops: Int { pitCount }

    var gapAheadMs: Double? {
        guard let g = gap, let v = Double(g.replacingOccurrences(of: "s", with: "").trimmingCharacters(in: .whitespaces)) else { return nil }
        return v * 1000
    }

    var gapBehindMs: Double? {
        guard let i = interval, let v = Double(i.replacingOccurrences(of: "s", with: "").trimmingCharacters(in: .whitespaces)) else { return nil }
        return v * 1000
    }

    var avgLap20Ms: Double? { avgLapMs }
    var best3Ms: Double? { bestAvgMs }

    var boxScore: Int? {
        guard let ts = tierScore else { return nil }
        return Int(ts)
    }

    enum CodingKeys: String, CodingKey {
        case rowId, kartNumber, position, totalLaps
        case lastLapMs, bestLapMs, avgLapMs, bestAvgMs, bestStintLapMs
        case gap, interval
        case pitCount, pitStatus
        case stintLapsCount, stintDurationS, stintElapsedMs
        case stintStartCountdownMs, stintStartTime
        case tierScore
        case driverName, teamName
        case driverDifferentialMs
    }
}
