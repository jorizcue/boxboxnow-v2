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
