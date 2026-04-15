import Foundation

struct DeviceSession: Codable, Hashable, Identifiable {
    let id: Int
    let deviceName: String
    let ipAddress: String?
    let userAgent: String?
    let createdAt: Date?
    let lastSeenAt: Date?
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
