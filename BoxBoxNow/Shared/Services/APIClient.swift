import Foundation

final class APIClient {
    static let shared = APIClient()
    private init() {}

    private var baseURL: String { Constants.apiBaseURL }

    func login(email: String, password: String) async throws -> AuthResponse {
        let body: [String: Any] = ["username": email, "password": password]
        return try await post("/auth/login", body: body)
    }

    func loginGoogle(idToken: String) async throws -> AuthResponse {
        let body: [String: Any] = ["id_token": idToken]
        return try await post("/auth/google/mobile", body: body)
    }

    func verifyMfa(tempToken: String, code: String) async throws -> AuthResponse {
        let body: [String: Any] = ["temp_token": tempToken, "code": code]
        return try await post("/auth/verify-mfa", body: body)
    }

    /// Fetch the current user from /auth/me (used after token hydration on app launch,
    /// since JWT payload doesn't contain all User fields like is_admin, tab_access, ...)
    func getMe() async throws -> User {
        return try await get("/auth/me")
    }

    func fetchPresets() async throws -> [DriverConfigPreset] {
        return try await get("/config/presets")
    }

    func createPreset(name: String, visibleCards: [String: Bool], cardOrder: [String],
                      isDefault: Bool = false, contrast: Double? = nil,
                      orientation: String? = nil, audioEnabled: Bool? = nil) async throws -> DriverConfigPreset {
        var body: [String: Any] = ["name": name, "visible_cards": visibleCards, "card_order": cardOrder]
        if isDefault { body["is_default"] = true }
        if let contrast { body["contrast"] = contrast }
        if let orientation { body["orientation"] = orientation }
        if let audioEnabled { body["audio_enabled"] = audioEnabled }
        return try await post("/config/presets", body: body)
    }

    func updatePreset(id: Int, name: String? = nil, visibleCards: [String: Bool]? = nil, cardOrder: [String]? = nil, isDefault: Bool? = nil) async throws -> DriverConfigPreset {
        var body = [String: Any]()
        if let n = name { body["name"] = n }
        if let vc = visibleCards { body["visible_cards"] = vc }
        if let co = cardOrder { body["card_order"] = co }
        if let isDefault { body["is_default"] = isDefault }
        return try await patch("/config/presets/\(id)", body: body)
    }

    func deletePreset(id: Int) async throws {
        try await deleteReq("/config/presets/\(id)")
    }

    // MARK: - Session

    /// Fetch active session. Returns nil if user has no active session yet.
    /// Backend returns `null` (200) in that case; naive decoding of a required
    /// `RaceSession` would throw, so we explicitly handle the null body.
    func getActiveSession() async throws -> RaceSession? {
        let req = try buildRequest("/config/session", method: "GET")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
        if http.statusCode == 401 { KeychainHelper.deleteToken(); throw APIError.unauthorized }
        guard (200...299).contains(http.statusCode) else { throw APIError.requestFailed }

        // Empty body or literal "null" → no active session yet.
        if data.isEmpty { return nil }
        let trimmed = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == "null" || trimmed == "" { return nil }

        return try JSONDecoder().decode(RaceSession.self, from: data)
    }

    func updateSession(_ session: RaceSession) async throws -> RaceSession {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(session)
        let body = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        return try await patch("/config/session", body: body)
    }

    /// Create a new active session. Required when the user has no session yet
    /// — PATCH /config/session would 404. Accepts a minimal circuit_id plus
    /// the full RaceSession values we want to persist.
    func createSession(_ session: RaceSession) async throws -> RaceSession {
        guard let circuitId = session.circuitId else {
            throw APIError.requestFailed
        }
        let body: [String: Any] = [
            "circuit_id": circuitId,
            "name": session.name ?? "",
            "duration_min": session.durationMin,
            "min_stint_min": session.minStintMin,
            "max_stint_min": session.maxStintMin,
            "min_pits": session.minPits,
            "pit_time_s": session.pitTimeS,
            "min_driver_time_min": session.minDriverTimeMin,
            "rain": session.rain,
            "pit_closed_start_min": session.pitClosedStartMin,
            "pit_closed_end_min": session.pitClosedEndMin,
            "box_lines": session.boxLines,
            "box_karts": session.boxKarts,
            "our_kart_number": session.ourKartNumber,
            "refresh_interval_s": session.refreshIntervalS,
        ]
        return try await post("/config/session", body: body)
    }

    /// PATCH session with an arbitrary dict (for fields not in RaceSession model, e.g. auto_load_teams)
    func patchSession(_ fields: [String: Any]) async throws {
        var req = try buildRequest("/config/session", method: "PATCH")
        req.httpBody = try JSONSerialization.data(withJSONObject: fields)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.requestFailed
        }
    }

    // MARK: - Teams

    func getTeams() async throws -> [Team] {
        return try await get("/config/teams")
    }

    func replaceTeams(_ teams: [Team]) async throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(teams)
        var req = try buildRequest("/config/teams", method: "PUT")
        req.httpBody = data
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.requestFailed
        }
    }

    func getLiveTeams() async throws -> LiveTeamsResponse {
        return try await get("/race/live-teams")
    }

    // MARK: - Circuits

    func getMyCircuits() async throws -> [Circuit] {
        return try await get("/config/circuits")
    }

    // MARK: - GPS Telemetry

    /// Upload completed GPS laps (matching web POST /api/gps/laps)
    func saveGpsLaps(_ laps: [[String: Any]]) async throws {
        let body: [String: Any] = ["laps": laps]
        var req = try buildRequest("/gps/laps", method: "POST")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.requestFailed
        }
    }

    // MARK: - Preferences

    func getPreferences() async throws -> DriverPreferences {
        return try await get("/config/preferences")
    }

    func updatePreferences(visibleCards: [String: Bool], cardOrder: [String]) async throws -> DriverPreferences {
        let body: [String: Any] = ["visible_cards": visibleCards, "card_order": cardOrder]
        return try await patch("/config/preferences", body: body)
    }

    // MARK: - Private

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let req = try buildRequest(path, method: "GET")
        return try await execute(req)
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        var req = try buildRequest(path, method: "POST")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(req)
    }

    private func patch<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        var req = try buildRequest(path, method: "PATCH")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(req)
    }

    private func deleteReq(_ path: String) async throws {
        let req = try buildRequest(path, method: "DELETE")
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.requestFailed
        }
    }

    private func buildRequest(_ path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: baseURL + path) else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let token = KeychainHelper.loadToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
        if http.statusCode == 401 { KeychainHelper.deleteToken(); throw APIError.unauthorized }
        guard (200...299).contains(http.statusCode) else { throw APIError.requestFailed }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum APIError: Error, LocalizedError {
    case invalidURL, requestFailed, unauthorized, decodingError
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "URL invalida"
        case .requestFailed: return "Error de conexion"
        case .unauthorized: return "Sesion expirada"
        case .decodingError: return "Error procesando datos"
        }
    }
}
