import Foundation

struct PitRecord: Codable, Hashable, Identifiable {
    var pitNumber: Int
    var lap: Int
    var raceTimeMs: Double
    var onTrackMs: Double
    var driverName: String
    var totalDriverMs: Double
    var pitTimeMs: Double
    var stintLaps: Int

    var id: Int { pitNumber }
}
