import Foundation
import Observation

@Observable
@MainActor
final class ConfigStore {
    var circuits: [Circuit] = []
    var selectedCircuitId: Int?
    var liveTimingURL: String?
    var presets: [DriverConfigPreset] = []
    var preferences: DriverPreferences?
    var isLoading: Bool = false
    var lastError: String?

    private let configService: ConfigService

    init(configService: ConfigService = ConfigService()) {
        self.configService = configService
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let circuits = configService.circuits()
            async let url = configService.liveTimingURL()
            async let presets = configService.presets()
            async let prefs = configService.preferences()
            self.circuits = try await circuits
            self.liveTimingURL = try? await url
            self.presets = try await presets
            self.preferences = try await prefs
            self.selectedCircuitId = self.circuits.first(where: { $0.isActive == true })?.id
        } catch {
            self.lastError = ErrorMessages.userFacing(error)
        }
    }

    func selectCircuit(id: Int) async {
        do {
            try await configService.selectCircuit(id: id)
            selectedCircuitId = id
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    /// Clears all observable state back to initial values. Called on logout
    /// so a subsequent login on the same AppStore instance doesn't briefly
    /// flash the previous user's config at the new user.
    func reset() {
        circuits = []
        selectedCircuitId = nil
        liveTimingURL = nil
        presets = []
        preferences = nil
        isLoading = false
        lastError = nil
    }
}
