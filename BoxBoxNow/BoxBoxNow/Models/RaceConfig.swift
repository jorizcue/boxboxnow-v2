import Foundation

struct RaceSession: Codable {
    let id: Int?
    var circuitId: Int?
    var circuitName: String?
    var name: String?
    var durationMin: Int
    var minStintMin: Int
    var maxStintMin: Int
    var minPits: Int
    var pitTimeS: Int
    var minDriverTimeMin: Int
    var rain: Bool
    var pitClosedStartMin: Int
    var pitClosedEndMin: Int
    var boxLines: Int
    var boxKarts: Int
    var ourKartNumber: Int
    var refreshIntervalS: Int
    var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, rain
        case circuitId = "circuit_id"
        case circuitName = "circuit_name"
        case durationMin = "duration_min"
        case minStintMin = "min_stint_min"
        case maxStintMin = "max_stint_min"
        case minPits = "min_pits"
        case pitTimeS = "pit_time_s"
        case minDriverTimeMin = "min_driver_time_min"
        case pitClosedStartMin = "pit_closed_start_min"
        case pitClosedEndMin = "pit_closed_end_min"
        case boxLines = "box_lines"
        case boxKarts = "box_karts"
        case ourKartNumber = "our_kart_number"
        case refreshIntervalS = "refresh_interval_s"
        case isActive = "is_active"
    }

    static let empty = RaceSession(
        id: nil, circuitId: nil, circuitName: nil, name: nil,
        durationMin: 60, minStintMin: 5, maxStintMin: 35, minPits: 2,
        pitTimeS: 180, minDriverTimeMin: 60, rain: false,
        pitClosedStartMin: 5, pitClosedEndMin: 5, boxLines: 1, boxKarts: 1,
        ourKartNumber: 1, refreshIntervalS: 3, isActive: false
    )
}

struct Circuit: Codable, Identifiable {
    let id: Int
    let name: String
    let lengthM: Int?

    enum CodingKeys: String, CodingKey {
        case id, name
        case lengthM = "length_m"
    }
}
