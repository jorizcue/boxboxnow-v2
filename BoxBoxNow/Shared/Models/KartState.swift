import Foundation

struct KartState: Identifiable, Codable, Hashable {
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
    var pitInCountdownMs: Double?
    var tierScore: Double?
    var driverName: String?
    var teamName: String?
    var driverDifferentialMs: Double?

    // Sector times — only populated when the active session's Apex grid
    // declares `s1|s2|s3` data-type columns (Campillos does, many
    // circuits don't). The "1/2/3" in the field names is the SECTOR
    // index, not the column index — backend resolves the cN→sector
    // mapping dynamically from each circuit's grid header.
    // `currentSNMs` is the latest sector time we've received for this
    // kart (used for the live "Δ vs field-best" indicator on the driver
    // dashboard). `bestSNMs` is the kart's own PB across the session,
    // used for the theoretical-best-lap card.
    var currentS1Ms: Double?
    var currentS2Ms: Double?
    var currentS3Ms: Double?
    var bestS1Ms: Double?
    var bestS2Ms: Double?
    var bestS3Ms: Double?

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
        case stintStartCountdownMs, stintStartTime, pitInCountdownMs
        case tierScore
        case driverName, teamName
        case driverDifferentialMs
        case currentS1Ms, currentS2Ms, currentS3Ms
        case bestS1Ms, bestS2Ms, bestS3Ms
    }
}
