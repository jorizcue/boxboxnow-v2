import Foundation

struct KartState: Identifiable, Codable {
    var id: Int { kartNumber }

    let kartNumber: Int
    var position: Int
    var laps: Int
    var lastLapMs: Double?
    var bestLapMs: Double?
    var gapToLeaderMs: Double?
    var gapToAheadMs: Double?
    var pitStops: Int
    var isInPit: Bool
    var stint: Int
    var speed: Double?
    var sector: Int?
}
