import Foundation

enum GeoUtils {
    // Meters per degree latitude (constant)
    private static let degToMLat: Double = 111_320

    // Meters per degree longitude at a given latitude
    private static func degToMLon(at lat: Double) -> Double {
        degToMLat * cos(lat * .pi / 180)
    }

    static func haversineDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let R = 6371000.0
        let dLat = (lat2 - lat1) * .pi / 180
        let dLon = (lon2 - lon1) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2) +
                cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) *
                sin(dLon / 2) * sin(dLon / 2)
        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c
    }

    /// Simple boolean intersection test (kept for backward compat).
    static func segmentsIntersect(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, p4: GeoPoint) -> Bool {
        return segmentCrossingFraction(a1: p1, a2: p2, b1: p3, b2: p4) != nil
    }

    /// Line-segment intersection matching web `segmentCrossingFraction()` in geo.ts.
    /// Converts lat/lon to local flat-earth meters before intersection math.
    /// Returns the fraction `t` (0..1) along segment a1→a2 where crossing occurs, or nil.
    static func segmentCrossingFraction(a1: GeoPoint, a2: GeoPoint, b1: GeoPoint, b2: GeoPoint) -> Double? {
        // Convert to local meters from a1
        let mLon = degToMLon(at: (a1.lat + b1.lat) / 2)

        let ax1 = 0.0, ay1 = 0.0
        let ax2 = (a2.lat - a1.lat) * degToMLat
        let ay2 = (a2.lon - a1.lon) * mLon
        let bx1 = (b1.lat - a1.lat) * degToMLat
        let by1 = (b1.lon - a1.lon) * mLon
        let bx2 = (b2.lat - a1.lat) * degToMLat
        let by2 = (b2.lon - a1.lon) * mLon

        let dx = ax2 - ax1
        let dy = ay2 - ay1
        let ex = bx2 - bx1
        let ey = by2 - by1

        let denom = dx * ey - dy * ex
        guard abs(denom) > 1e-10 else { return nil } // parallel

        let t = ((bx1 - ax1) * ey - (by1 - ay1) * ex) / denom
        let u = ((bx1 - ax1) * dy - (by1 - ay1) * dx) / denom

        if t >= 0 && t <= 1 && u >= 0 && u <= 1 { return t }
        return nil
    }

    static func bearingBetween(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let dLon = (lon2 - lon1) * .pi / 180
        let la1 = lat1 * .pi / 180, la2 = lat2 * .pi / 180
        let y = sin(dLon) * cos(la2)
        let x = cos(la1) * sin(la2) - sin(la1) * cos(la2) * cos(dLon)
        let bearing = atan2(y, x) * 180 / .pi
        return (bearing + 360).truncatingRemainder(dividingBy: 360)
    }
}
