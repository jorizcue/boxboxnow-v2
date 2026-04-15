import Foundation

struct PublicStatus: Codable { let ok: Bool; let version: String? }

struct PublicService {
    let api = APIClient.shared
    func status() async throws -> PublicStatus { try await api.getJSON("/public/status") }
}
