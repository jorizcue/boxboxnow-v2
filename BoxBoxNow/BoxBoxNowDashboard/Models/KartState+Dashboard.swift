import Foundation

// Dashboard-only extensions to the shared KartState model.
// This file is ONLY in the BoxBoxNowDashboard target — the driver app
// does not need these types.
extension KartState {
    struct RecentLap: Codable, Hashable {
        var lapTime: Double
        var totalLap: Int
        var driverName: String
    }
}

// The shared KartState declares Codable + Identifiable only, because the
// driver app never needs Hashable. The dashboard does (SwiftUI diffing,
// set membership, KartStateFull auto-synthesis), so we add it here in the
// dashboard-only extension file — no impact on the driver target.
//
// Because this extension lives in a different file from the struct
// declaration, Swift cannot auto-synthesize Hashable/Equatable; we provide
// them manually by hashing/comparing every stored property.
extension KartState: Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(rowId)
        hasher.combine(kartNumber)
        hasher.combine(position)
        hasher.combine(totalLaps)
        hasher.combine(lastLapMs)
        hasher.combine(bestLapMs)
        hasher.combine(avgLapMs)
        hasher.combine(bestAvgMs)
        hasher.combine(bestStintLapMs)
        hasher.combine(gap)
        hasher.combine(interval)
        hasher.combine(pitCount)
        hasher.combine(pitStatus)
        hasher.combine(stintLapsCount)
        hasher.combine(stintDurationS)
        hasher.combine(stintElapsedMs)
        hasher.combine(stintStartCountdownMs)
        hasher.combine(stintStartTime)
        hasher.combine(tierScore)
        hasher.combine(driverName)
        hasher.combine(teamName)
        hasher.combine(driverDifferentialMs)
    }

    public static func == (lhs: KartState, rhs: KartState) -> Bool {
        lhs.rowId == rhs.rowId &&
        lhs.kartNumber == rhs.kartNumber &&
        lhs.position == rhs.position &&
        lhs.totalLaps == rhs.totalLaps &&
        lhs.lastLapMs == rhs.lastLapMs &&
        lhs.bestLapMs == rhs.bestLapMs &&
        lhs.avgLapMs == rhs.avgLapMs &&
        lhs.bestAvgMs == rhs.bestAvgMs &&
        lhs.bestStintLapMs == rhs.bestStintLapMs &&
        lhs.gap == rhs.gap &&
        lhs.interval == rhs.interval &&
        lhs.pitCount == rhs.pitCount &&
        lhs.pitStatus == rhs.pitStatus &&
        lhs.stintLapsCount == rhs.stintLapsCount &&
        lhs.stintDurationS == rhs.stintDurationS &&
        lhs.stintElapsedMs == rhs.stintElapsedMs &&
        lhs.stintStartCountdownMs == rhs.stintStartCountdownMs &&
        lhs.stintStartTime == rhs.stintStartTime &&
        lhs.tierScore == rhs.tierScore &&
        lhs.driverName == rhs.driverName &&
        lhs.teamName == rhs.teamName &&
        lhs.driverDifferentialMs == rhs.driverDifferentialMs
    }
}

// We cannot add stored properties to extensions in Swift. Instead we decode
// the dashboard-only fields into a side-struct and carry it as a runtime
// payload on KartState when needed. The dashboard never mutates KartState
// itself for these; it decodes a KartStateFull aggregate instead.
struct KartStateFull: Codable, Identifiable, Hashable {
    let base: KartState
    var pitHistory: [PitRecord]
    var driverTotalMs: [String: Double]
    var driverAvgLapMs: [String: Double]
    var recentLaps: [KartState.RecentLap]

    var id: String { base.id }

    init(from decoder: Decoder) throws {
        self.base = try KartState(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.pitHistory    = try c.decodeIfPresent([PitRecord].self, forKey: .pitHistory) ?? []
        self.driverTotalMs = try c.decodeIfPresent([String: Double].self, forKey: .driverTotalMs) ?? [:]
        self.driverAvgLapMs = try c.decodeIfPresent([String: Double].self, forKey: .driverAvgLapMs) ?? [:]
        self.recentLaps    = try c.decodeIfPresent([KartState.RecentLap].self, forKey: .recentLaps) ?? []
    }

    func encode(to encoder: Encoder) throws {
        try base.encode(to: encoder)
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(pitHistory, forKey: .pitHistory)
        try c.encode(driverTotalMs, forKey: .driverTotalMs)
        try c.encode(driverAvgLapMs, forKey: .driverAvgLapMs)
        try c.encode(recentLaps, forKey: .recentLaps)
    }

    private enum CodingKeys: String, CodingKey {
        case pitHistory, driverTotalMs, driverAvgLapMs, recentLaps
    }
}
