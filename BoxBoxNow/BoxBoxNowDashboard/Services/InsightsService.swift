import Foundation

struct InsightsService {
    let api = APIClient.shared

    /// List laps (summary only — no trace arrays).
    func laps(circuitId: Int? = nil, limit: Int = 50) async throws -> [GPSLapSummary] {
        var query: [URLQueryItem] = []
        if let cid = circuitId { query.append(URLQueryItem(name: "circuit_id", value: "\(cid)")) }
        query.append(URLQueryItem(name: "limit", value: "\(limit)"))
        return try await api.getJSON("/gps/laps", query: query)
    }

    /// Single lap with full trace data (positions, speeds, g-forces).
    func lapDetail(lapId: Int) async throws -> GPSLapDetail {
        try await api.getJSON("/gps/laps/\(lapId)")
    }

    /// Aggregated stats across all laps (optionally filtered by circuit).
    func stats(circuitId: Int? = nil) async throws -> GPSStats {
        var query: [URLQueryItem] = []
        if let cid = circuitId { query.append(URLQueryItem(name: "circuit_id", value: "\(cid)")) }
        return try await api.getJSON("/gps/stats", query: query)
    }
}
