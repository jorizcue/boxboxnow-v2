import Foundation

struct User: Codable, Identifiable {
    let id: Int
    let email: String
    let name: String
    let isAdmin: Bool
    let tabs: [String]
    let circuits: [Int]

    enum CodingKeys: String, CodingKey {
        case id, email, name, tabs, circuits
        case isAdmin = "is_admin"
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

struct AuthResponse: Codable {
    let accessToken: String
    let user: User?
    let requiresMfa: Bool?
    let tempToken: String?

    enum CodingKeys: String, CodingKey {
        case user
        case accessToken = "access_token"
        case requiresMfa = "requires_mfa"
        case tempToken = "temp_token"
    }
}
