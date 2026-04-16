import Foundation

struct UserListItem: Codable, Hashable, Identifiable {
    let id: Int
    var username: String
    var email: String?
    var isAdmin: Bool
    var tabAccess: [String]?
    var hasActiveSubscription: Bool?
    var subscriptionPlan: String?
    var maxDevices: Int?
    var mfaEnabled: Bool?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, username, email
        case isAdmin = "is_admin"
        case tabAccess = "tab_access"
        case hasActiveSubscription = "has_active_subscription"
        case subscriptionPlan = "subscription_plan"
        case maxDevices = "max_devices"
        case mfaEnabled = "mfa_enabled"
        case createdAt = "created_at"
    }
}
