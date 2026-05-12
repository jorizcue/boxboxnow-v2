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
    let subscriptionStatus: String?
    /// Driver-view card `rawValue`s the user's plan exposes in the
    /// preset editor. Resolved on-the-fly by the backend from the
    /// active subscription's `ProductTabConfig.allowed_cards`. Empty
    /// or nil means "no opinion" → fall back to the full local
    /// catalog so older builds / trial users don't get stripped.
    let allowedCards: [String]?
    // Kept as String (ISO-8601) rather than Date? so APIClient.execute can
    // decode it with a bare JSONDecoder (no .iso8601 strategy). The backend
    // serializes UserOut.created_at as an ISO-8601 string via Pydantic.
    let createdAt: String?

    var displayName: String { username }

    enum CodingKeys: String, CodingKey {
        case id, username, email
        case isAdmin = "is_admin"
        case mfaEnabled = "mfa_enabled"
        case mfaRequired = "mfa_required"
        case tabAccess = "tab_access"
        case hasActiveSubscription = "has_active_subscription"
        case subscriptionPlan = "subscription_plan"
        case subscriptionStatus = "subscription_status"
        case allowedCards = "allowed_cards"
        case createdAt = "created_at"
    }
}

struct DriverConfigPreset: Codable, Identifiable {
    let id: Int
    let name: String
    let visibleCards: [String: Bool]
    let cardOrder: [String]
    let isDefault: Bool
    let contrast: Double?
    let orientation: String?
    let audioEnabled: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name
        case visibleCards = "visible_cards"
        case cardOrder = "card_order"
        case isDefault = "is_default"
        case contrast
        case orientation
        case audioEnabled = "audio_enabled"
    }

    init(id: Int, name: String, visibleCards: [String: Bool], cardOrder: [String],
         isDefault: Bool = false, contrast: Double? = nil, orientation: String? = nil,
         audioEnabled: Bool? = nil) {
        self.id = id
        self.name = name
        self.visibleCards = visibleCards
        self.cardOrder = cardOrder
        self.isDefault = isDefault
        self.contrast = contrast
        self.orientation = orientation
        self.audioEnabled = audioEnabled
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(Int.self, forKey: .id)
        self.name = try c.decode(String.self, forKey: .name)
        self.visibleCards = try c.decode([String: Bool].self, forKey: .visibleCards)
        self.cardOrder = try c.decode([String].self, forKey: .cardOrder)
        self.isDefault = (try? c.decode(Bool.self, forKey: .isDefault)) ?? false
        self.contrast = try? c.decode(Double.self, forKey: .contrast)
        self.orientation = try? c.decode(String.self, forKey: .orientation)
        self.audioEnabled = try? c.decode(Bool.self, forKey: .audioEnabled)
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
