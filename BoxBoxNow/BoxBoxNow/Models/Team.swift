import Foundation

struct TeamDriver: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var driverName: String
    var differentialMs: Int

    enum CodingKeys: String, CodingKey {
        case driverName = "driver_name"
        case differentialMs = "differential_ms"
    }

    init(id: UUID = UUID(), driverName: String, differentialMs: Int) {
        self.id = id
        self.driverName = driverName
        self.differentialMs = differentialMs
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = UUID()
        self.driverName = try c.decodeIfPresent(String.self, forKey: .driverName) ?? ""
        self.differentialMs = try c.decodeIfPresent(Int.self, forKey: .differentialMs) ?? 0
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(driverName, forKey: .driverName)
        try c.encode(differentialMs, forKey: .differentialMs)
    }
}

struct Team: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var position: Int
    var kart: Int
    var teamName: String
    var drivers: [TeamDriver]

    enum CodingKeys: String, CodingKey {
        case position, kart, drivers
        case teamName = "team_name"
    }

    init(id: UUID = UUID(), position: Int, kart: Int, teamName: String, drivers: [TeamDriver]) {
        self.id = id
        self.position = position
        self.kart = kart
        self.teamName = teamName
        self.drivers = drivers
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = UUID()
        self.position = try c.decodeIfPresent(Int.self, forKey: .position) ?? 0
        self.kart = try c.decodeIfPresent(Int.self, forKey: .kart) ?? 0
        self.teamName = try c.decodeIfPresent(String.self, forKey: .teamName) ?? ""
        self.drivers = try c.decodeIfPresent([TeamDriver].self, forKey: .drivers) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(position, forKey: .position)
        try c.encode(kart, forKey: .kart)
        try c.encode(teamName, forKey: .teamName)
        try c.encode(drivers, forKey: .drivers)
    }
}

struct LiveTeamsResponse: Codable {
    let teams: [Team]
    let hasDrivers: Bool
    let kartCount: Int

    enum CodingKeys: String, CodingKey {
        case teams
        case hasDrivers = "hasDrivers"
        case kartCount = "kartCount"
    }
}
