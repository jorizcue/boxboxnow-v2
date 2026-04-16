import Foundation

struct AdminService {
    let api = APIClient.shared

    // MARK: - Users

    func listUsers() async throws -> [UserListItem] {
        try await api.getJSON("/admin/users")
    }
    func updateUser(id: Int, fields: [String: JSONValue]) async throws -> UserListItem {
        try await api.patchJSON("/admin/users/\(id)", body: fields)
    }
    func deleteUser(id: Int) async throws {
        try await api.deleteJSON("/admin/users/\(id)")
    }
    func updateUserTabs(userId: Int, tabs: [String]) async throws {
        struct TabsBody: Encodable { let tabs: [String] }
        let _: [String: [String]] = try await api.putJSON("/admin/users/\(userId)/tabs", body: TabsBody(tabs: tabs))
    }
    func resetMfa(userId: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/admin/users/\(userId)/mfa/reset", body: EmptyBody())
    }

    // MARK: - Circuits

    func listCircuits() async throws -> [Circuit] {
        try await api.getJSON("/admin/circuits")
    }
    func createCircuit(_ c: Circuit) async throws -> Circuit {
        try await api.postJSON("/admin/circuits", body: c)
    }
    func updateCircuit(_ c: Circuit) async throws -> Circuit {
        try await api.patchJSON("/admin/circuits/\(c.id)", body: c)
    }
    func deleteCircuit(id: Int) async throws {
        try await api.deleteJSON("/admin/circuits/\(id)")
    }

    // MARK: - Hub

    func hubStatus() async throws -> [HubCircuitStatus] {
        let response: HubStatusResponse = try await api.getJSON("/admin/hub/status")
        return response.circuits
    }
    func hubStart(circuitId: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/admin/hub/\(circuitId)/start", body: EmptyBody())
    }
    func hubStop(circuitId: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/admin/hub/\(circuitId)/stop", body: EmptyBody())
    }

    // MARK: - Platform Settings

    func platformSettings() async throws -> [String: String] {
        try await api.getJSON("/admin/platform-settings")
    }
    func updatePlatformSettings(_ settings: [String: String]) async throws -> [String: String] {
        try await api.putJSON("/admin/platform-settings", body: settings)
    }
}
