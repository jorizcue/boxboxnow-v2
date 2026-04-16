import Foundation

struct AnalyticsService {
    let api = APIClient.shared

    /// Circuits available to the user for analytics.
    /// Reuses the shared Circuit model -- extra fields are ignored by the decoder.
    func circuits() async throws -> [Circuit] {
        try await api.getJSON("/analytics/circuits")
    }

    func kartStats(circuitId: Int, dateFrom: String?, dateTo: String?, filterOutliers: Bool = true) async throws -> [KartStats] {
        var query = [URLQueryItem(name: "circuit_id", value: "\(circuitId)")]
        if let df = dateFrom { query.append(URLQueryItem(name: "date_from", value: df)) }
        if let dt = dateTo { query.append(URLQueryItem(name: "date_to", value: dt)) }
        query.append(URLQueryItem(name: "filter_outliers", value: filterOutliers ? "true" : "false"))
        return try await api.getJSON("/analytics/kart-stats", query: query)
    }

    func kartBestLaps(circuitId: Int, kartNumber: Int, dateFrom: String?, dateTo: String?) async throws -> [KartBestLap] {
        var query = [
            URLQueryItem(name: "circuit_id", value: "\(circuitId)"),
            URLQueryItem(name: "kart_number", value: "\(kartNumber)")
        ]
        if let df = dateFrom { query.append(URLQueryItem(name: "date_from", value: df)) }
        if let dt = dateTo { query.append(URLQueryItem(name: "date_to", value: dt)) }
        return try await api.getJSON("/analytics/kart-best-laps", query: query)
    }

    func kartDrivers(circuitId: Int, kartNumber: Int, dateFrom: String?, dateTo: String?) async throws -> [KartDriver] {
        var query = [
            URLQueryItem(name: "circuit_id", value: "\(circuitId)"),
            URLQueryItem(name: "kart_number", value: "\(kartNumber)")
        ]
        if let df = dateFrom { query.append(URLQueryItem(name: "date_from", value: df)) }
        if let dt = dateTo { query.append(URLQueryItem(name: "date_to", value: dt)) }
        return try await api.getJSON("/analytics/kart-drivers", query: query)
    }
}
