import Foundation

// Dashboard-only extensions to the shared KartState model.
// This file is ONLY in the BoxBoxNowDashboard target — the driver app
// does not need these types.
//
// The compound KartStateFull struct that decodes the v1.1 snapshot's
// extended fields (pitHistory, driverTotalMs, driverAvgLapMs, recentLaps)
// lives in Task 5 alongside PitRecord. Task 3 only introduces the
// RecentLap nested type, because it has no cross-task dependency.
extension KartState {
    struct RecentLap: Codable, Hashable {
        var lapTime: Double
        var totalLap: Int
        var driverName: String
    }
}
