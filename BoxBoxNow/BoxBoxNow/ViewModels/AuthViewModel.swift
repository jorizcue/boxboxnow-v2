import SwiftUI
import Combine
import AuthenticationServices

final class AuthViewModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var isAuthenticated = false
    @Published var user: User?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isGoogleLoading = false
    @Published var showMfa = false
    @Published var mfaCode = ""
    @Published var tempToken: String?
    @Published var showBiometricPrompt = false  // offer to enable after first login
    @Published var biometricPending = false     // waiting for Face ID on app launch

    // Keep a strong reference so the session isn't deallocated mid-flow
    private var authSession: ASWebAuthenticationSession?

    override init() {
        super.init()
        checkExistingSession()
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Return the key window as anchor
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            return ASPresentationAnchor()
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
                if let payload = KeychainHelper.decodeJWTPayload(token),
                   let userData = try? JSONSerialization.data(withJSONObject: payload),
                   let user = try? JSONDecoder().decode(User.self, from: userData) {
                    self.user = user
                }
                print("[Auth] Google login OK")
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.authSession = session // keep strong reference
        session.start()
    }

    func verifyMfa(code: String) {
        guard let tmp = tempToken else { return }
        isLoading = true
        Task { @MainActor in
            do {
                let resp = try await APIClient.shared.verifyMfa(tempToken: tmp, code: code)
                handleAuthResponse(resp)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    /// Normal logout: keeps token + biometric so user can re-enter with Face ID
    func logout() {
        isAuthenticated = false
        user = nil
        showMfa = false
        tempToken = nil
        biometricPending = false
        // Token stays in Keychain for biometric re-login
    }

    /// Full sign-out: wipes everything including biometric preference
    func fullSignOut() {
        KeychainHelper.deleteToken()
        BiometricService.disable()
        logout()
    }

    private func checkExistingSession() {
        guard let token = KeychainHelper.loadToken() else { return }
        guard let payload = KeychainHelper.decodeJWTPayload(token),
              let exp = payload["exp"] as? TimeInterval,
              exp > Date().timeIntervalSince1970 else {
            KeychainHelper.deleteToken()
            BiometricService.disable()
            return
        }

        // Decode user from token payload
        let decodedUser: User? = {
            guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
            return try? JSONDecoder().decode(User.self, from: data)
        }()

        if BiometricService.isEnabled && BiometricService.isAvailable {
            // Require biometric before granting access
            biometricPending = true
            user = decodedUser
            Task { await authenticateWithBiometric() }
        } else {
            // No biometric — auto-login as before
            isAuthenticated = true
            user = decodedUser
        }
    }

    /// Attempt biometric auth; on success grant access, on failure show login form
    func authenticateWithBiometric() async {
        let success = await BiometricService.authenticate()
        await MainActor.run {
            biometricPending = false
            if success {
                isAuthenticated = true
            }
            // If failed, user stays on login screen with token still in keychain
        }
    }

    /// Called after a successful login to offer enabling biometric
    func enableBiometric() {
        BiometricService.isEnabled = true
        showBiometricPrompt = false
    }

    func skipBiometric() {
        showBiometricPrompt = false
    }

    private func handleAuthResponse(_ resp: AuthResponse) {
        if let token = resp.accessToken as String? {
            KeychainHelper.saveToken(token)
            user = resp.user
            isAuthenticated = true

            // Offer biometric setup if available and not already enabled
            if BiometricService.isAvailable && !BiometricService.isEnabled {
                showBiometricPrompt = true
            }
        }
    }
}
