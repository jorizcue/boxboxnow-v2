import Foundation

enum GeoUtils {
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

    static func segmentsIntersect(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, p4: GeoPoint) -> Bool {
        let d1x = p2.lon - p1.lon, d1y = p2.lat - p1.lat
        let d2x = p4.lon - p3.lon, d2y = p4.lat - p3.lat
        let denom = d1x * d2y - d1y * d2x
        guard abs(denom) > 1e-12 else { return false }
        let dx = p3.lon - p1.lon, dy = p3.lat - p1.lat
        let t = (dx * d2y - dy * d2x) / denom
        let u = (dx * d1y - dy * d1x) / denom
        return t >= 0 && t <= 1 && u >= 0 && u <= 1
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
