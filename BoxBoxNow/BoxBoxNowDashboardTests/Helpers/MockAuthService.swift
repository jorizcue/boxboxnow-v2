import Foundation
@testable import BoxBoxNowDashboard

final class MockAuthService: AuthServicing {
    var loginHandler: ((String, String) async throws -> LoginResponse)?
    var verifyMFAHandler: ((String) async throws -> LoginResponse)?
    var meHandler: (() async throws -> User)?
    var logoutHandler: (() async throws -> Void)?

    func login(email: String, password: String) async throws -> LoginResponse {
        try await loginHandler!(email, password)
    }
    func verifyMFA(code: String) async throws -> LoginResponse {
        try await verifyMFAHandler!(code)
    }
    func me() async throws -> User {
        try await meHandler!()
    }
    func logout() async throws {
        try await logoutHandler?()
    }
    func sessions() async throws -> [DeviceSession] { [] }
    func deleteSession(id: Int) async throws {}
}
