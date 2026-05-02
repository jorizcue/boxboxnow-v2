import SwiftUI
import Combine
import AuthenticationServices

final class AuthViewModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var isAuthenticated = false
    @Published var user: User?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isGoogleLoading = false

    /// Set when the backend rejects the client's version with HTTP 426.
    /// LoginView swaps its whole body for a blocking "update required"
    /// card while this is non-nil — no retry button, the only way out
    /// is to update from the App Store.
    @Published var upgradeRequired: UpgradeRequiredInfo?

    // Keep a strong reference so the session isn't deallocated mid-flow
    private var authSession: ASWebAuthenticationSession?

    override init() {
        super.init()
        checkExistingSession()
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            return ASPresentationAnchor(windowScene: UIApplication.shared.connectedScenes.first as! UIWindowScene)
        }
        return window
    }

    func login(email: String, password: String) {
        isLoading = true; errorMessage = nil
        Task { @MainActor in
            do {
                let resp = try await APIClient.shared.login(email: email, password: password)
                print("[Auth] Login OK, token: \(resp.accessToken.prefix(20))...")
                handleAuthResponse(resp)
                print("[Auth] isAuthenticated = \(isAuthenticated)")
            } catch let APIError.upgradeRequired(info) {
                // Don't surface as a regular error — the login UI will
                // swap itself out for a blocking update-required view.
                print("[Auth] Upgrade required: min=\(info.minVersion ?? "?")")
                upgradeRequired = info
            } catch {
                print("[Auth] Login error: \(error)")
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func loginWithGoogle() {
        guard let url = URL(string: "\(Constants.apiBaseURL)/auth/google/ios") else {
            errorMessage = "URL de Google login inválida"
            return
        }
        errorMessage = nil

        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "boxboxnow") { [weak self] callbackURL, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                self.authSession = nil // release
                self.isGoogleLoading = false

                if let error = error as? ASWebAuthenticationSessionError,
                   error.code == .canceledLogin {
                    // User cancelled — don't show error
                    return
                }
                if let error = error {
                    self.errorMessage = error.localizedDescription
                    return
                }
                guard let url = callbackURL,
                      let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                    self.errorMessage = "Respuesta inválida de Google"
                    return
                }

                // Check for error from backend
                if let errParam = components.queryItems?.first(where: { $0.name == "error" })?.value {
                    if errParam == "no_account" {
                        self.errorMessage = "No existe una cuenta con ese email de Google"
                    } else {
                        self.errorMessage = "Error: \(errParam)"
                    }
                    return
                }

                guard let token = components.queryItems?.first(where: { $0.name == "token" })?.value else {
                    self.errorMessage = "No se recibió token de autenticación"
                    return
                }

                // Decode JWT to get the username (sub claim) for per-user Keychain slot
                let username = KeychainHelper.decodeJWTPayload(token)?["sub"] as? String ?? ""
                KeychainHelper.saveToken(token, forUser: username)
                self.isAuthenticated = true
                // Fetch full User from /auth/me (JWT payload lacks is_admin / tab_access)
                Task { await self.refreshMe() }
                print("[Auth] Google login OK")
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.authSession = session // keep strong reference
        session.start()
    }

    /// Normal logout: flips local state but keeps the token in Keychain so
    /// `checkExistingSession` can auto-login on the next app launch (until
    /// the JWT expires or the user does a full sign-out). The server-side
    /// DeviceSession is kept alive — matches the "soft lock" semantics
    /// the product wants.
    func logout() {
        isAuthenticated = false
        user = nil
    }

    /// Full sign-out: wipes the local token AND tells the server to delete
    /// the DeviceSession so it no longer appears under "Sesiones activas"
    /// in the admin panel. The server call is fire-and-forget — if the
    /// network is flaky or the token already expired, local state is
    /// cleaned up regardless.
    func fullSignOut() {
        Task {
            do {
                try await APIClient.shared.serverLogout()
            } catch {
                // Swallow — local cleanup below still happens.
            }
            await MainActor.run {
                KeychainHelper.deleteToken()
                logout()
            }
        }
    }

    private func checkExistingSession() {
        // Auto-login if the stored JWT is still valid. Biometric was
        // removed (matches the Android cleanup in commit e66181b).
        guard let token = KeychainHelper.loadToken() else { return }
        guard let payload = KeychainHelper.decodeJWTPayload(token),
              let exp = payload["exp"] as? TimeInterval,
              exp > Date().timeIntervalSince1970 else {
            KeychainHelper.deleteToken()
            return
        }
        // JWT payload only contains {sub, sid, exp, ...} — NOT full User
        // fields. /auth/me populates is_admin, tab_access, etc.
        isAuthenticated = true
        Task { await refreshMe() }
    }

    /// Refresh the local User object from /auth/me (id, is_admin, tab_access, ...)
    @MainActor
    func refreshMe() async {
        do {
            let fresh = try await APIClient.shared.getMe()
            self.user = fresh
        } catch {
            // If unauthorized, APIClient already deletes the token
            print("[Auth] /auth/me failed: \(error)")
        }
    }

    private func handleAuthResponse(_ resp: AuthResponse) {
        if let token = resp.accessToken as String? {
            // Save token keyed to this specific user so multiple accounts
            // on the same device each have their own isolated Keychain slot.
            let username = resp.user?.username ?? ""
            KeychainHelper.saveToken(token, forUser: username)
            user = resp.user
            isAuthenticated = true
        }
    }
}
