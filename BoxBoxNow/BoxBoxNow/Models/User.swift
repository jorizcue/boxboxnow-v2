import Foundation

struct User: Codable, Identifiable {
    let id: Int
    let username: String
    let email: String?
    let isAdmin: Bool
    let mfaEnabled: Bool?
    let mfaRequired: Bool?
    let tabAccess: [String]?
    let hasActiveSubscription: Bool?
    let subscriptionPlan: String?

    var displayName: String { username }

    enum CodingKeys: String, CodingKey {
        case id, username, email
        case isAdmin = "is_admin"
        case mfaEnabled = "mfa_enabled"
        case mfaRequired = "mfa_required"
        case tabAccess = "tab_access"
        case hasActiveSubscription = "has_active_subscription"
        case subscriptionPlan = "subscription_plan"
    }
}

struct DriverConfigPreset: Codable, Identifiable {
    let id: Int
    let name: String
    let visibleCards: [String: Bool]
    let cardOrder: [String]

    enum CodingKeys: String, CodingKey {
        case id, name
        case visibleCards = "visible_cards"
        case cardOrder = "card_order"
    }
}

struct DriverPreferences: Codable {
    let visibleCards: [String: Bool]
    let cardOrder: [String]

    enum CodingKeys: String, CodingKey {
        case visibleCards = "visible_cards"
        case cardOrder = "card_order"
    }
}

struct AuthResponse: Codable {
    let accessToken: String
    let tokenType: String?
    let sessionToken: String?
    let user: User?

    enum CodingKeys: String, CodingKey {
        case user
        case accessToken = "access_token"
        case tokenType = "token_type"
        case sessionToken = "session_token"
    }
}
