import Foundation

final class APIClient {
    static let shared = APIClient()
    private init() {}

    private var baseURL: String { Constants.apiBaseURL }

    func login(email: String, password: String) async throws -> AuthResponse {
        let body: [String: Any] = ["email": email, "password": password]
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

    func fetchPresets() async throws -> [DriverConfigPreset] {
        return try await get("/config/presets")
    }

    func createPreset(name: String, visibleCards: [String: Bool], cardOrder: [String]) async throws -> DriverConfigPreset {
        let body: [String: Any] = ["name": name, "visible_cards": visibleCards, "card_order": cardOrder]
        return try await post("/config/presets", body: body)
    }

    func updatePreset(id: Int, name: String?, visibleCards: [String: Bool]?, cardOrder: [String]?) async throws -> DriverConfigPreset {
        var body = [String: Any]()
        if let n = name { body["name"] = n }
        if let vc = visibleCards { body["visible_cards"] = vc }
        if let co = cardOrder { body["card_order"] = co }
        return try await patch("/config/presets/\(id)", body: body)
    }

    func deletePreset(id: Int) async throws {
        try await deleteReq("/config/presets/\(id)")
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
