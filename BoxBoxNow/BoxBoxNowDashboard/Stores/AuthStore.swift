import Foundation
import Observation

@Observable
@MainActor
final class AuthStore {

    enum AuthState: Equatable {
        case loggedOut
        case authenticating
        case needsMFACode
        case needsMFASetup(otpAuthURL: String)
        case loggedIn
        case loginFailed(message: String)
    }

    // Public observable state
    var authState: AuthState = .loggedOut
    var user: User?
    var pendingEmail: String = ""

    private let service: AuthServicing
    private let keychain: KeychainProtocol
    nonisolated(unsafe) private var authExpiredObserver: NSObjectProtocol?

    init(service: AuthServicing, keychain: KeychainProtocol) {
        self.service = service
        self.keychain = keychain

        authExpiredObserver = NotificationCenter.default.addObserver(
            forName: .authExpired, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handleAuthExpired() }
        }
    }

    deinit {
        if let obs = authExpiredObserver { NotificationCenter.default.removeObserver(obs) }
    }

    // MARK: - Actions

    func login(email: String, password: String) async {
        authState = .authenticating
        pendingEmail = email
        do {
            let resp = try await service.login(email: email, password: password)
            apply(resp)
        } catch {
            authState = .loginFailed(message: userFacingMessage(for: error))
        }
    }

    func verifyMFA(code: String) async {
        authState = .authenticating
        do {
            let resp = try await service.verifyMFA(code: code)
            apply(resp)
        } catch {
            authState = .loginFailed(message: userFacingMessage(for: error))
        }
    }

    func loginWithExistingToken(_ token: String) async throws {
        keychain.saveToken(token)
        do {
            let me = try await service.me()
            self.user = me
            self.authState = .loggedIn
        } catch {
            keychain.deleteToken()
            self.authState = .loggedOut
            throw error
        }
    }

    func logout() async {
        try? await service.logout()
        keychain.deleteToken()
        user = nil
        pendingEmail = ""
        authState = .loggedOut
    }

    func bootstrap() async {
        if let token = keychain.loadToken() {
            authState = .authenticating
            // Bootstrap swallows the rejection error on purpose: the user hasn't
            // actively tried to sign in this session, so there's no UI to show
            // an error in — we just fall back to the login screen. The catch
            // inside `loginWithExistingToken` already set authState to .loggedOut.
            try? await loginWithExistingToken(token)
        } else {
            authState = .loggedOut
        }
    }

    // MARK: - Internals

    private func apply(_ resp: LoginResponse) {
        self.user = resp.user

        if resp.mfaRequired && !resp.mfaEnabled {
            let otpURL = resp.mfaSecret ?? ""
            authState = .needsMFASetup(otpAuthURL: otpURL)
            return
        }
        if resp.mfaEnabled && resp.accessToken.isEmpty {
            authState = .needsMFACode
            return
        }
        keychain.saveToken(resp.accessToken)
        authState = .loggedIn
    }

    private func handleAuthExpired() {
        keychain.deleteToken()
        user = nil
        pendingEmail = ""
        authState = .loggedOut
    }

    private func userFacingMessage(for error: Error) -> String {
        if let apiError = error as? APIError, case .unauthorized = apiError {
            return "Invalid email or password. Please try again."
        }
        return ErrorMessages.userFacing(error)
    }
}
