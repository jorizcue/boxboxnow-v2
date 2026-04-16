import Foundation

struct HubCircuitStatus: Codable, Identifiable {
    let circuitId: Int
    let circuitName: String
    let connected: Bool
    let subscribers: Int
    let messages: Int
    let wsUrl: String
    let connectedUsers: [HubConnectedUser]

    var id: Int { circuitId }

    enum CodingKeys: String, CodingKey {
        case circuitId = "circuit_id"
        case circuitName = "circuit_name"
        case connected, subscribers, messages
        case wsUrl = "ws_url"
        case connectedUsers = "connected_users"
    }
}

struct HubConnectedUser: Codable, Hashable, Identifiable {
    let id: Int
    let username: String
}

struct HubStatusResponse: Codable {
    let circuits: [HubCircuitStatus]
}
