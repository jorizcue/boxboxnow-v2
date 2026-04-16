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

// We cannot add stored properties to extensions in Swift. Instead we decode
// the dashboard-only fields into a side-struct and carry it as a runtime
// payload on KartState when needed. The dashboard never mutates KartState
// itself for these; it decodes a KartStateFull aggregate instead.
struct KartStateFull: Codable, Identifiable, Hashable {
    var base: KartState
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

    // Memberwise init for preview/testing — the custom Decoder init blocks
    // the compiler-synthesized memberwise init.
    init(base: KartState, pitHistory: [PitRecord] = [], driverTotalMs: [String: Double] = [:], driverAvgLapMs: [String: Double] = [:], recentLaps: [KartState.RecentLap] = []) {
        self.base = base
        self.pitHistory = pitHistory
        self.driverTotalMs = driverTotalMs
        self.driverAvgLapMs = driverAvgLapMs
        self.recentLaps = recentLaps
    }

    #if DEBUG
    static var preview: KartStateFull {
        KartStateFull(
            base: KartState(
                rowId: "preview-1",
                kartNumber: 7,
                position: 3,
                totalLaps: 24,
                lastLapMs: 52345,
                bestLapMs: 51123,
                avgLapMs: 52500,
                bestAvgMs: 51800,
                bestStintLapMs: 51123,
                gap: "1.234",
                interval: "0.456",
                pitCount: 2,
                pitStatus: "out",
                stintLapsCount: 12,
                stintDurationS: 720,
                stintElapsedMs: 540000,
                stintStartCountdownMs: nil,
                stintStartTime: nil,
                tierScore: 82.0,
                driverName: "Demo",
                teamName: "Demo Team",
                driverDifferentialMs: 234
            )
        )
    }
    #endif
}
