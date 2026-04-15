import Foundation

/// Represents one active device session on the user's account (e.g. an iPad
/// that's currently logged in).
///
/// Date fields are stored as ISO-8601 strings, not `Date`, to stay
/// decoder-contract-compatible with the rest of the codebase — `APIClient`
/// uses a bare `JSONDecoder` with no `.dateDecodingStrategy`, which cannot
/// parse ISO-8601 strings into `Date?`. `User.createdAt` ships the same way
/// for the same reason (Task 3). If this ever regresses to `Date?`, the
/// `/api/auth/sessions` call will crash at runtime.
struct DeviceSession: Codable, Hashable, Identifiable {
    let id: Int
    let deviceName: String
    let ipAddress: String?
    let userAgent: String?
    let createdAt: String?
    let lastSeenAt: String?
    let isCurrent: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case deviceName = "device_name"
        case ipAddress  = "ip_address"
        case userAgent  = "user_agent"
        case createdAt  = "created_at"
        case lastSeenAt = "last_seen_at"
        case isCurrent  = "is_current"
    }
}
