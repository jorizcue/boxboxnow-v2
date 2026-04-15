import Foundation

/// Unified GPS sample from RaceBox BLE or phone GPS.
struct GPSSample {
    let timestamp: TimeInterval
    let lat: Double
    let lon: Double
    let altitudeM: Double
    let speedKmh: Double
    let headingDeg: Double
    var gForceX: Double
    var gForceY: Double
    var gForceZ: Double
    let fixType: Int
    let numSatellites: Int
    let batteryPercent: Int?

    var speedMms: Double { speedKmh / 3.6 * 1000.0 }
}

struct FinishLine: Codable, Equatable {
    let p1: GeoPoint
    let p2: GeoPoint
}

struct GeoPoint: Codable, Equatable {
    let lat: Double
    let lon: Double
}
