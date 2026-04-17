import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class AuthStoreStateMachineTests: XCTestCase {

    func testInitialStateIsLoggedOut() {
        let store = AuthStore(service: MockAuthService(), keychain: MockKeychainHelper())
        XCTAssertEqual(store.authState, .loggedOut)
        XCTAssertNil(store.user)
    }

    func testSuccessfulLoginWithoutMFA() async throws {
        let mock = MockAuthService()
        let kc = MockKeychainHelper()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "tkn", user: Self.makeUser(mfaEnabled: false, mfaRequired: false), mfaRequired: false, mfaEnabled: false, mfaSecret: nil)
        }
        let store = AuthStore(service: mock, keychain: kc)

        await store.login(email: "a@b.c", password: "pw")

        XCTAssertEqual(store.authState, .loggedIn)
        XCTAssertEqual(store.user?.username, "alice")
        XCTAssertEqual(kc.savedToken, "tkn")
    }

    func testLoginWithMFARequiredGoesToNeedsMFACode() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "", user: Self.makeUser(mfaEnabled: true, mfaRequired: true), mfaRequired: true, mfaEnabled: true, mfaSecret: nil)
        }
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "pw")
        XCTAssertEqual(store.authState, .needsMFACode)
    }

    func testLoginWithMFARequiredButNotEnabledGoesToSetup() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "", user: Self.makeUser(mfaEnabled: false, mfaRequired: true), mfaRequired: true, mfaEnabled: false, mfaSecret: "otpauth://totp/…")
        }
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "pw")
        if case .needsMFASetup(let url) = store.authState {
            XCTAssertTrue(url.contains("otpauth"))
        } else {
            XCTFail("expected needsMFASetup")
        }
    }

    func testVerifyMFASuccess() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "", user: Self.makeUser(mfaEnabled: true, mfaRequired: true), mfaRequired: true, mfaEnabled: true, mfaSecret: nil)
        }
        mock.verifyMFAHandler = { code in
            XCTAssertEqual(code, "123456")
            return LoginResponse(accessToken: "final", user: Self.makeUser(mfaEnabled: true, mfaRequired: true), mfaRequired: true, mfaEnabled: true, mfaSecret: nil)
        }
        let kc = MockKeychainHelper()
        let store = AuthStore(service: mock, keychain: kc)
        await store.login(email: "a@b.c", password: "pw")
        await store.verifyMFA(code: "123456")
        XCTAssertEqual(store.authState, .loggedIn)
        XCTAssertEqual(kc.savedToken, "final")
    }

    func testLoginFailureSetsLoginFailed() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in throw APIError.unauthorized() }
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "bad")
        if case .loginFailed(let msg) = store.authState {
            XCTAssertFalse(msg.isEmpty)
        } else {
            XCTFail("expected loginFailed")
        }
    }

    func testLogoutClearsState() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "tkn", user: Self.makeUser(mfaEnabled: false, mfaRequired: false), mfaRequired: false, mfaEnabled: false, mfaSecret: nil)
        }
        mock.logoutHandler = {}
        let kc = MockKeychainHelper()
        kc.savedToken = "tkn"
        let store = AuthStore(service: mock, keychain: kc)
        await store.login(email: "a@b.c", password: "pw")
        await store.logout()
        XCTAssertEqual(store.authState, .loggedOut)
        XCTAssertNil(store.user)
        XCTAssertNil(kc.savedToken)
    }

    func testAuthExpiredNotificationLogsOut() async throws {
        let store = AuthStore(service: MockAuthService(), keychain: MockKeychainHelper())
        // Pretend we were logged in
        store.authState = .loggedIn
        NotificationCenter.default.post(name: .authExpired, object: nil)
        try await Task.sleep(nanoseconds: 100_000_000) // allow observer to fire
        XCTAssertEqual(store.authState, .loggedOut)
    }

    func testLoginFailureWithUnauthorizedGetsUserFacingMessage() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in throw APIError.unauthorized() }
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "bad")
        if case .loginFailed(let msg) = store.authState {
            // Must NOT contain the Cocoa default garbage.
            XCTAssertFalse(msg.contains("The operation couldn't be completed"), "got Cocoa default: \(msg)")
            XCTAssertFalse(msg.contains("APIError error"), "got Cocoa default: \(msg)")
            // Must be a real user-facing message.
            XCTAssertTrue(msg.lowercased().contains("invalid") || msg.lowercased().contains("password"),
                          "expected user-facing message, got: \(msg)")
        } else {
            XCTFail("expected loginFailed, got \(store.authState)")
        }
    }

    func testLogoutClearsPendingEmail() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "tkn",
                          user: Self.makeUser(mfaEnabled: false, mfaRequired: false),
                          mfaRequired: false, mfaEnabled: false, mfaSecret: nil)
        }
        mock.logoutHandler = {}
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "pw")
        XCTAssertEqual(store.pendingEmail, "a@b.c")
        await store.logout()
        XCTAssertEqual(store.pendingEmail, "")
    }

    // MARK: - Helpers
    private static func makeUser(mfaEnabled: Bool, mfaRequired: Bool) -> User {
        User(
            id: 1, username: "alice", email: "a@b.c", isAdmin: false,
            mfaEnabled: mfaEnabled, mfaRequired: mfaRequired,
            tabAccess: ["race","pit","live","config"],
            hasActiveSubscription: true, subscriptionPlan: "pro_monthly",
            subscriptionStatus: "active", createdAt: nil
        )
    }
}
