import Foundation

struct UserListItem: Codable, Hashable, Identifiable {
    let id: Int
    var username: String
    var email: String?
    var isAdmin: Bool
    var tabAccess: [String]?
    var hasActiveSubscription: Bool?
    var subscriptionPlan: String?

    enum CodingKeys: String, CodingKey {
        case id, username, email
        case isAdmin = "is_admin"
        case tabAccess = "tab_access"
        case hasActiveSubscription = "has_active_subscription"
        case subscriptionPlan = "subscription_plan"
    }
}
