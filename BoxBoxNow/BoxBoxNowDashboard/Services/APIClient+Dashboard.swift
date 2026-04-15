import Foundation

// Dashboard-only additive surface on the shared APIClient.
// None of these methods overlap with the existing driver-app methods —
// they use distinct generic signatures that encode with JSONEncoder
// instead of dict-based JSONSerialization.

public extension Notification.Name {
    static let authExpired = Notification.Name("BBNAuthExpired")
}

extension APIClient {
    /// Injectable for tests. When non-nil, all dashboard requests use this session.
    var overrideURLSession: URLSession? {
        get { objc_getAssociatedObject(self, &overrideSessionKey) as? URLSession }
        set { objc_setAssociatedObject(self, &overrideSessionKey, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    // Dashboard models currently use `String?` for timestamps (see
    // User.createdAt, DeviceSession.createdAt/lastSeenAt), so `.iso8601` is
    // defensive-only — it does nothing for String fields. If someone later
    // adds a `Date` field to a dashboard model, make sure the server emits
    // strict ISO 8601 with no fractional-second variation, or swap the
    // strategy to `.formatted` with an explicit DateFormatter.
    private static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private var effectiveSession: URLSession { overrideURLSession ?? URLSession.shared }

    // --- Generic REST surface ---

    func getJSON<T: Decodable>(_ path: String, query: [URLQueryItem]? = nil) async throws -> T {
        let req = try buildDashboardRequest(path, method: "GET", query: query, body: nil)
        return try await executeJSON(req)
    }

    func postJSON<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        let data = try Self.jsonEncoder.encode(body)
        let req = try buildDashboardRequest(path, method: "POST", query: nil, body: data)
        return try await executeJSON(req)
    }

    func patchJSON<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        let data = try Self.jsonEncoder.encode(body)
        let req = try buildDashboardRequest(path, method: "PATCH", query: nil, body: data)
        return try await executeJSON(req)
    }

    func deleteJSON(_ path: String) async throws {
        let req = try buildDashboardRequest(path, method: "DELETE", query: nil, body: nil)
        let (_, response) = try await effectiveSession.data(for: req)
        try handleStatus(response, request: req)
    }

    // --- Internals ---

    private func buildDashboardRequest(_ path: String, method: String, query: [URLQueryItem]?, body: Data?) throws -> URLRequest {
        var components = URLComponents(string: Constants.apiBaseURL + path)
        if let query { components?.queryItems = query }
        guard let url = components?.url else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let token = KeychainHelper.loadToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        return req
    }

    private func executeJSON<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await effectiveSession.data(for: req)
        try handleStatus(response, request: req)
        return try Self.jsonDecoder.decode(T.self, from: data)
    }

    /// Posts `.authExpired` only when the originating request was authenticated — avoids logging the user out of the login screen itself when bad credentials return 401.
    private func handleStatus(_ response: URLResponse, request: URLRequest) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
        if http.statusCode == 401 {
            let wasAuthenticated = request.value(forHTTPHeaderField: "Authorization") != nil
            KeychainHelper.deleteToken()
            if wasAuthenticated {
                NotificationCenter.default.post(name: .authExpired, object: nil)
            }
            throw APIError.unauthorized
        }
        guard (200...299).contains(http.statusCode) else { throw APIError.requestFailed }
    }
}

private var overrideSessionKey: UInt8 = 0
