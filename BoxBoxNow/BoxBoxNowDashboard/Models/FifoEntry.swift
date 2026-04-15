import Foundation

struct FifoEntry: Codable, Hashable, Identifiable {
    var score: Double
    var kartNumber: Int
    var teamName: String
    var driverName: String
    var avgLapMs: Double?
    var avgPosition: Double?
    var recentLaps: [KartState.RecentLap]?
    var pitCount: Int?
    var stintLaps: Int?
    var line: Int?

    var id: Int { kartNumber }
}
