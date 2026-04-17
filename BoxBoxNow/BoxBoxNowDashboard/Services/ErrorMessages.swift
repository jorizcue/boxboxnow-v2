import Foundation

/// Converts an `Error` to a user-facing message suitable for UI display.
/// Handles `APIError` cases explicitly; falls back to `error.localizedDescription`
/// for everything else.
///
/// This helper is shared across all stores (AuthStore, ConfigStore, AdminStore)
/// so they surface consistent messages and none of them accidentally render
/// Cocoa's default `NSError` description for `APIError.unauthorized`, which
/// looks like "The operation couldn't be completed. (BoxBoxNowDashboard.APIError error 0.)".
enum ErrorMessages {
    static func userFacing(_ error: Error) -> String {
        if let apiError = error as? APIError {
            // When the server supplied a detail message, prefer it — it's
            // almost always more specific than our generic fallback
            // (e.g. "Invalid credentials", "Max devices reached…").
            // APIError.errorDescription already handles this logic, so we
            // delegate to it and only override when the error has no
            // server message and we want a different default.
            switch apiError {
            case .unauthorized(let msg):
                return msg ?? "Your session has expired. Please sign in again."
            case .requestFailed(let msg):
                return msg ?? "Couldn't reach the server. Check your connection and try again."
            case .rateLimited(let msg):
                return msg ?? "Too many attempts. Please try again in a few minutes."
            case .conflict(let msg):
                return msg ?? "Device limit reached. Close an existing session to continue."
            case .invalidURL:
                return "Invalid request. Please contact support."
            case .decodingError:
                return "Unexpected response from the server. Please try again."
            }
        }
        return error.localizedDescription
    }
}
