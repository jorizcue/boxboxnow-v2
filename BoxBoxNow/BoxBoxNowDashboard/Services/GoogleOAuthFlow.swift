import Foundation
import UIKit
import AuthenticationServices

enum GoogleOAuthError: Error {
    case noToken
    case cancelled
    case backendError(String)
}

/// Native Google Sign-In flow for the iPad dashboard app.
///
/// Hits the `/api/auth/google/ipad` backend route which ultimately redirects
/// to `boxboxnowdashboard://auth?token=...` (success) or
/// `boxboxnowdashboard://auth?error=no_account` (no matching user).
/// ASWebAuthenticationSession intercepts the custom-scheme callback WITHOUT
/// requiring Info.plist registration, so this flow is self-contained.
@MainActor
final class GoogleOAuthFlow: NSObject, ASWebAuthenticationPresentationContextProviding {

    // Keep a strong reference so the session isn't deallocated mid-flow.
    // The driver app hit this exact bug in production — session must outlive
    // `start()` until its completion handler fires.
    private var authSession: ASWebAuthenticationSession?

    func start() async throws -> String {
        guard let authURL = URL(string: "\(Constants.apiBaseURL)/auth/google/ipad") else {
            throw GoogleOAuthError.cancelled
        }
        let scheme = "boxboxnowdashboard"

        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
            let session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: scheme) { callbackURL, error in
                // ASWebAuthenticationSession calls this on an internal queue.
                // Hop to main before mutating @MainActor state or resuming.
                Task { @MainActor [weak self] in
                    self?.authSession = nil

                    if let asError = error as? ASWebAuthenticationSessionError, asError.code == .canceledLogin {
                        cont.resume(throwing: GoogleOAuthError.cancelled)
                        return
                    }
                    if let error {
                        cont.resume(throwing: error)
                        return
                    }
                    guard let url = callbackURL else {
                        cont.resume(throwing: GoogleOAuthError.cancelled)
                        return
                    }
                    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
                    if let errParam = components?.queryItems?.first(where: { $0.name == "error" })?.value {
                        let msg: String
                        if errParam == "no_account" {
                            msg = "No existe una cuenta con ese email de Google"
                        } else {
                            msg = "Error de Google: \(errParam)"
                        }
                        cont.resume(throwing: GoogleOAuthError.backendError(msg))
                        return
                    }
                    guard let token = components?.queryItems?.first(where: { $0.name == "token" })?.value else {
                        cont.resume(throwing: GoogleOAuthError.noToken)
                        return
                    }
                    cont.resume(returning: token)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session // keep strong reference until completion fires
            session.start()
        }
    }

    // Implemented as `nonisolated` to satisfy the protocol requirement without
    // marking it @MainActor (which would fail to conform). The body uses
    // `MainActor.assumeIsolated` because ASWebAuthenticationSession guarantees
    // this is called on the main thread per Apple's documentation.
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
