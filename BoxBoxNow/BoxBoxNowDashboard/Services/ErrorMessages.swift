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
            switch apiError {
            case .unauthorized:
                return "Your session has expired. Please sign in again."
            case .requestFailed:
                return "Couldn't reach the server. Check your connection and try again."
            case .invalidURL:
                return "Invalid request. Please contact support."
            case .decodingError:
                return "Unexpected response from the server. Please try again."
            }
        }
        return error.localizedDescription
    }
}
