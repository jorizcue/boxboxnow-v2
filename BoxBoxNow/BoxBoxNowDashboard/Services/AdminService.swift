import Foundation

struct AdminService {
    let api = APIClient.shared

    func listUsers() async throws -> [UserListItem] {
        try await api.getJSON("/admin/users")
    }
    func updateUser(id: Int, fields: [String: JSONValue]) async throws -> UserListItem {
        try await api.patchJSON("/admin/users/\(id)", body: fields)
    }
    func deleteUser(id: Int) async throws {
        try await api.deleteJSON("/admin/users/\(id)")
    }
    func resetPassword(id: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/admin/users/\(id)/reset-password", body: EmptyBody())
    }
    func listCircuits() async throws -> [Circuit] {
        try await api.getJSON("/admin/circuits")
    }
    func createCircuit(_ c: Circuit) async throws -> Circuit {
        try await api.postJSON("/admin/circuits", body: c)
    }
    func updateCircuit(_ c: Circuit) async throws -> Circuit {
        try await api.patchJSON("/admin/circuits/\(c.id)", body: c)
    }
    func platformMetrics() async throws -> PlatformMetrics {
        try await api.getJSON("/admin/platform/metrics")
    }
}
