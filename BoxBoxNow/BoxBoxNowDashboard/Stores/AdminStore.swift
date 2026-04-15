import Foundation
import Observation

@Observable
@MainActor
final class AdminStore {
    var users: [UserListItem] = []
    var circuits: [Circuit] = []
    var platformMetrics: PlatformMetrics?
    var isLoading: Bool = false
    var lastError: String?

    private let service: AdminService
    init(service: AdminService = AdminService()) { self.service = service }

    func refreshAll() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let users = service.listUsers()
            async let circs = service.listCircuits()
            async let metrics = service.platformMetrics()
            self.users = try await users
            self.circuits = try await circs
            self.platformMetrics = try? await metrics
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }
}
