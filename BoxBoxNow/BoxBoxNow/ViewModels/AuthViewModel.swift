import SwiftUI
import Combine
import AuthenticationServices

final class AuthViewModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var isAuthenticated = false
    @Published var user: User?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isGoogleLoading = false
    @Published var showBiometricPrompt = false  // offer to enable after first login
    @Published var biometricPending = false     // waiting for Face ID on app launch

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

                KeychainHelper.saveToken(token)
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

    /// Normal logout: flips local state but keeps the token + biometric
    /// so the user can re-enter with Face ID. The server-side DeviceSession
    /// is kept alive (matches the "soft lock" semantics the product wants).
    func logout() {
        isAuthenticated = false
        user = nil
        biometricPending = false
        // Token stays in Keychain for biometric re-login
    }

    /// Full sign-out: wipes local token + biometric AND tells the server
    /// to delete the DeviceSession so it no longer appears under "Sesiones
    /// activas" in the admin panel. The server call is fire-and-forget —
    /// if the network is flaky or the token already expired, local state
    /// is cleaned up regardless.
    func fullSignOut() {
        Task {
            do {
                try await APIClient.shared.serverLogout()
            } catch {
                // Swallow — local cleanup below still happens.
            }
            await MainActor.run {
                KeychainHelper.deleteToken()
                BiometricService.disable()
                logout()
            }
        }
    }

    private func checkExistingSession() {
        // Load the last-known username to look up the right keychain slot.
        guard let token = KeychainHelper.loadToken() else { return }
        guard let payload = KeychainHelper.decodeJWTPayload(token),
              let exp = payload["exp"] as? TimeInterval,
              exp > Date().timeIntervalSince1970 else {
            KeychainHelper.deleteToken()
            BiometricService.disable()
            return
        }

        // JWT payload only contains {sub, sid, exp, ...} — NOT full User fields.
        // We'll fetch /auth/me below to populate is_admin, tab_access, etc.

        // Check biometric for the user stored in keychain (per-user flag).
        if BiometricService.isEnabled && BiometricService.isAvailable {
            // Require biometric before granting access; fetch user in background
            biometricPending = true
            Task { await refreshMe() }
            Task { await authenticateWithBiometric() }
        } else {
            // No biometric — auto-login as before; fetch user in background
            isAuthenticated = true
            Task { await refreshMe() }
        }
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

    /// Attempt biometric auth; on success, VALIDATE the token against the
    /// server before granting access so we don't let the user into an
    /// account that was deleted or whose session was killed while the
    /// token sat locally. If the server rejects the token, we wipe the
    /// keychain + biometric flag so the next launch shows the login form.
    func authenticateWithBiometric() async {
        let success = await BiometricService.authenticate()
        guard success else {
            await MainActor.run {
                biometricPending = false
                // Failed biometric — user stays on login screen with token
                // still in keychain so they can retry.
            }
            return
        }
        // Face/Touch ID succeeded — check the token is still valid.
        do {
            let me = try await APIClient.shared.getMe()
            await MainActor.run {
                self.user = me
                self.biometricPending = false
                self.isAuthenticated = true
            }
        } catch {
            // Token is invalid (user deleted, session killed, DB reset).
            // APIClient already nuked the token on 401 — also wipe
            // biometric preference and send the user back to login.
            await MainActor.run {
                KeychainHelper.deleteToken()
                BiometricService.disable()
                self.biometricPending = false
                self.isAuthenticated = false
                self.user = nil
                self.errorMessage = "La sesion ya no es valida. Inicia sesion de nuevo."
            }
        }
    }

    /// Called after a successful login to offer enabling biometric
    func enableBiometric() {
        // Enable biometric for the currently logged-in user only
        if let username = user?.username {
            BiometricService.setEnabled(true, for: username)
        } else {
            BiometricService.isEnabled = true  // fallback to last-username key
        }
        showBiometricPrompt = false
    }

    func skipBiometric() {
        showBiometricPrompt = false
    }

    private func handleAuthResponse(_ resp: AuthResponse) {
        if let token = resp.accessToken as String? {
            // Save token keyed to this specific user so multiple accounts
            // on the same device each have their own isolated Keychain slot.
            let username = resp.user?.username ?? ""
            KeychainHelper.saveToken(token, forUser: username)
            user = resp.user
            isAuthenticated = true

            // Offer biometric setup if available and not already enabled for this user
            if BiometricService.isAvailable && !BiometricService.isEnabled(for: username) {
                showBiometricPrompt = true
            }
        }
    }
}
