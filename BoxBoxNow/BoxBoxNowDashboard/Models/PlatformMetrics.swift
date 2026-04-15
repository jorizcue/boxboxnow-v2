import Foundation

struct PlatformMetrics: Codable, Hashable {
    let totalUsers: Int
    let activeSubscriptions: Int
    let activeSessions: Int
    let wsConnections: Int
    let backendVersion: String?

    enum CodingKeys: String, CodingKey {
        case totalUsers = "total_users"
        case activeSubscriptions = "active_subscriptions"
        case activeSessions = "active_sessions"
        case wsConnections = "ws_connections"
        case backendVersion = "backend_version"
    }
}
