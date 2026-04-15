import Foundation

protocol AuthServicing {
    func login(email: String, password: String) async throws -> LoginResponse
    func verifyMFA(code: String) async throws -> LoginResponse
    func me() async throws -> User
    func logout() async throws
    func sessions() async throws -> [DeviceSession]
    func deleteSession(id: Int) async throws
}

struct LoginResponse: Codable {
    let accessToken: String
    let user: User
    let mfaRequired: Bool
    let mfaEnabled: Bool
    let mfaSecret: String?

    enum CodingKeys: String, CodingKey {
        case user
        case accessToken = "access_token"
        case mfaRequired = "mfa_required"
        case mfaEnabled  = "mfa_enabled"
        case mfaSecret   = "mfa_secret"
    }
}

struct MFAVerifyRequest: Codable { let mfaCode: String; enum CodingKeys: String, CodingKey { case mfaCode = "mfa_code" } }
struct LoginRequest: Codable { let username: String; let password: String }
struct EmptyBody: Codable {}

extension AuthService: AuthServicing {}

struct AuthService {
    let api = APIClient.shared

    func login(email: String, password: String) async throws -> LoginResponse {
        try await api.postJSON("/auth/login", body: LoginRequest(username: email, password: password))
    }
    func verifyMFA(code: String) async throws -> LoginResponse {
        try await api.postJSON("/auth/mfa/verify", body: MFAVerifyRequest(mfaCode: code))
    }
    func me() async throws -> User {
        try await api.getJSON("/auth/me")
    }
    func logout() async throws {
        let _: EmptyBody = try await api.postJSON("/auth/logout", body: EmptyBody())
    }
    func sessions() async throws -> [DeviceSession] {
        try await api.getJSON("/auth/sessions")
    }
    func deleteSession(id: Int) async throws {
        try await api.deleteJSON("/auth/sessions/\(id)")
    }
}
