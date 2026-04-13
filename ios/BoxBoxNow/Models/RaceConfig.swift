import Foundation

struct RaceConfig: Codable {
    var circuitId: Int
    var sessionName: String
    var totalLaps: Int?
    var totalMinutes: Int?
    var kartCount: Int
    var finishLineP1: GeoPoint?
    var finishLineP2: GeoPoint?

    static let empty = RaceConfig(
        circuitId: 0,
        sessionName: "",
        totalLaps: nil,
        totalMinutes: nil,
        kartCount: 0,
        finishLineP1: nil,
        finishLineP2: nil
    )
}
