import Foundation

struct ClassificationEntry: Codable, Hashable, Identifiable {
    var position: Int
    var kartNumber: Int
    var teamName: String
    var driverName: String
    var totalLaps: Int
    var pitCount: Int
    var gap: String
    var interval: String
    var avgLapMs: Double
    var tierScore: Double

    var id: Int { kartNumber }
}
