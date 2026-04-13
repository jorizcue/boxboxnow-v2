import SwiftUI
import Combine
import AuthenticationServices

final class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var user: User?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showMfa = false
    @Published var mfaCode = ""
    @Published var tempToken: String?

    init() { checkExistingSession() }

    func login(email: String, password: String) {
        isLoading = true; errorMessage = nil
        Task { @MainActor in
            do {
                let resp = try await APIClient.shared.login(email: email, password: password)
                handleAuthResponse(resp)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func loginWithGoogle() {
        guard let url = URL(string: "\(Constants.apiBaseURL)/auth/google/ios") else { return }
        let scheme = "boxboxnow"
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
            guard let self = self else { return }
            if let error = error {
                DispatchQueue.main.async { self.errorMessage = error.localizedDescription }
                return
            }
            guard let url = callbackURL,
                  let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  let token = components.queryItems?.first(where: { $0.name == "token" })?.value else { return }
            DispatchQueue.main.async {
                KeychainHelper.saveToken(token)
                self.isAuthenticated = true
                // Decode user from token
                if let payload = KeychainHelper.decodeJWTPayload(token),
                   let userData = try? JSONSerialization.data(withJSONObject: payload),
                   let user = try? JSONDecoder().decode(User.self, from: userData) {
                    self.user = user
                }
            }
        }
        session.prefersEphemeralWebBrowserSession = false
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

    func logout() {
        KeychainHelper.deleteToken()
        isAuthenticated = false
        user = nil
        showMfa = false
        tempToken = nil
    }

    private func checkExistingSession() {
        guard let token = KeychainHelper.loadToken() else { return }
        if let payload = KeychainHelper.decodeJWTPayload(token),
           let exp = payload["exp"] as? TimeInterval,
           exp > Date().timeIntervalSince1970 {
            isAuthenticated = true
            if let userData = try? JSONSerialization.data(withJSONObject: payload),
               let user = try? JSONDecoder().decode(User.self, from: userData) {
                self.user = user
            }
        } else {
            KeychainHelper.deleteToken()
        }
    }

    private func handleAuthResponse(_ resp: AuthResponse) {
        if resp.requiresMfa == true {
            tempToken = resp.tempToken
            showMfa = true
        } else if let token = resp.accessToken as String? {
            KeychainHelper.saveToken(token)
            user = resp.user
            isAuthenticated = true
        }
    }
}
