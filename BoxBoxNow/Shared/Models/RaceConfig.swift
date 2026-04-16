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
    /// When true, the server re-pushes team data on every race init; the
    /// team editor watches `teams_updated` WS events and reloads the form.
    /// Optional so older clients / payloads without the field still decode;
    /// default `nil` also keeps existing memberwise initializer call sites
    /// working without requiring explicit values.
    var autoLoadTeams: Bool? = nil

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
        case autoLoadTeams = "auto_load_teams"
    }

    static let empty = RaceSession(
        id: nil, circuitId: nil, circuitName: nil, name: nil,
        durationMin: 60, minStintMin: 5, maxStintMin: 35, minPits: 2,
        pitTimeS: 180, minDriverTimeMin: 60, rain: false,
        pitClosedStartMin: 5, pitClosedEndMin: 5, boxLines: 1, boxKarts: 1,
        ourKartNumber: 1, refreshIntervalS: 3, isActive: false,
        autoLoadTeams: false
    )
}

struct Circuit: Codable, Identifiable, Hashable {
    let id: Int
    var name: String
    var lengthM: Int?
    var finishLat1: Double?
    var finishLon1: Double?
    var finishLat2: Double?
    var finishLon2: Double?
    var isActive: Bool?
    // Admin-only fields (returned by /admin/circuits). All optional so
    // non-admin snapshots that omit them still decode cleanly.
    var pitTimeS: Int?
    var wsPort: Int?
    var wsPortData: Int?
    var phpApiPort: Int?
    var lapsDiscard: Int?
    var lapDifferential: Int?
    var phpApiUrl: String?
    var liveTimingUrl: String?
    var retentionDays: Int?

    enum CodingKeys: String, CodingKey {
        case id, name
        case lengthM = "length_m"
        case finishLat1 = "finish_lat_1"
        case finishLon1 = "finish_lon_1"
        case finishLat2 = "finish_lat_2"
        case finishLon2 = "finish_lon_2"
        case isActive   = "is_active"
        case pitTimeS = "pit_time_s"
        case wsPort = "ws_port"
        case wsPortData = "ws_port_data"
        case phpApiPort = "php_api_port"
        case lapsDiscard = "laps_discard"
        case lapDifferential = "lap_differential"
        case phpApiUrl = "php_api_url"
        case liveTimingUrl = "live_timing_url"
        case retentionDays = "retention_days"
    }
}

// Dashboard-only race config (wider than the driver's RaceSession).
// Decoded from the dashboard snapshot; the driver app does not use this type.
//
// Contract: this is an "all-or-nothing" snapshot. The dashboard backend emits
// every non-optional field on every snapshot push — there is no partial
// update semantics. Optional fields (finishLat1/Lon1/Lat2/Lon2) are the only
// legitimately-absent fields; they represent two finish-line reference points
// that may not be surveyed yet for a given circuit.
//
// Design note: circuitLengthM is a Double here even though Circuit.lengthM is
// Int?. The dashboard snapshot promotes the circuit length to a Double to
// accommodate future sub-meter precision (circuit-length survey data from the
// insights service) without breaking the wire contract. Do not unify the two
// types — Circuit is the admin-editable source of truth in integer meters;
// RaceConfig is a derived view that may diverge.
struct RaceConfig: Codable, Hashable {
    var circuitLengthM: Double
    var pitTimeS: Double
    var ourKartNumber: Int
    var minPits: Int
    var maxStintMin: Int
    var minStintMin: Int
    var durationMin: Int
    var boxLines: Int
    var boxKarts: Int
    var minDriverTimeMin: Int
    var pitClosedStartMin: Int
    var pitClosedEndMin: Int
    /// Optional so a config payload that omits `rain` (older backend builds,
    /// analytics frames before April 2026) still decodes. Treat missing as
    /// `false` at call sites.
    var rain: Bool?
    var finishLat1: Double?
    var finishLon1: Double?
    var finishLat2: Double?
    var finishLon2: Double?
}
