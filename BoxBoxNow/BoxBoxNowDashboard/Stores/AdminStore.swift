import Foundation
import Observation

@Observable
@MainActor
final class AdminStore {
    var users: [UserListItem] = []
    var circuits: [Circuit] = []
    var hubStatuses: [HubCircuitStatus] = []
    var platformSettings: [String: String] = [:]
    var isLoading: Bool = false
    var isLoadingHub: Bool = false
    var lastError: String?

    private let service: AdminService
    init(service: AdminService = AdminService()) { self.service = service }

    // MARK: - Bulk refresh

    func refreshAll() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let u = service.listUsers()
            async let c = service.listCircuits()
            self.users = try await u
            self.circuits = try await c
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
        // Non-critical loads — don't block on failure
        self.hubStatuses = (try? await service.hubStatus()) ?? []
        self.platformSettings = (try? await service.platformSettings()) ?? [:]
    }

    // MARK: - Users

    func refreshUsers() async {
        do {
            self.users = try await service.listUsers()
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }

    func updateUser(id: Int, fields: [String: JSONValue]) async throws {
        let updated = try await service.updateUser(id: id, fields: fields)
        if let idx = users.firstIndex(where: { $0.id == id }) {
            users[idx] = updated
        }
    }

    func updateUserTabs(userId: Int, tabs: [String]) async throws {
        try await service.updateUserTabs(userId: userId, tabs: tabs)
        await refreshUsers()
    }

    func resetMfa(userId: Int) async throws {
        try await service.resetMfa(userId: userId)
    }

    func deleteUser(id: Int) async throws {
        try await service.deleteUser(id: id)
        users.removeAll { $0.id == id }
    }

    /// Creates a new user and refreshes the list on success.
    @discardableResult
    func createUser(username: String, password: String, email: String?, isAdmin: Bool, maxDevices: Int) async -> UserListItem? {
        do {
            let body = AdminService.CreateUserBody(
                username: username, password: password, email: email,
                isAdmin: isAdmin, maxDevices: maxDevices
            )
            let created = try await service.createUser(body)
            await refreshUsers()
            return created
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
            return nil
        }
    }

    // MARK: - Circuits

    func refreshCircuits() async {
        do {
            self.circuits = try await service.listCircuits()
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }

    @discardableResult
    func saveCircuit(_ circuit: Circuit, isNew: Bool) async -> Circuit? {
        do {
            let saved: Circuit = isNew
                ? try await service.createCircuit(circuit)
                : try await service.updateCircuit(circuit)
            if let idx = circuits.firstIndex(where: { $0.id == saved.id }) {
                circuits[idx] = saved
            } else {
                circuits.append(saved)
            }
            return saved
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
            return nil
        }
    }

    func deleteCircuit(id: Int) async throws {
        try await service.deleteCircuit(id: id)
        circuits.removeAll { $0.id == id }
    }

    // MARK: - Hub

    func loadHubStatus() async {
        isLoadingHub = true
        defer { isLoadingHub = false }
        do {
            self.hubStatuses = try await service.hubStatus()
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }

    func hubStart(circuitId: Int) async {
        do {
            try await service.hubStart(circuitId: circuitId)
            await loadHubStatus()
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }

    func hubStop(circuitId: Int) async {
        do {
            try await service.hubStop(circuitId: circuitId)
            await loadHubStatus()
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }

    // MARK: - Platform Settings

    func loadPlatformSettings() async {
        do {
            self.platformSettings = try await service.platformSettings()
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }

    func savePlatformSetting(key: String, value: String) async {
        do {
            self.platformSettings = try await service.updatePlatformSettings([key: value])
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }
}
