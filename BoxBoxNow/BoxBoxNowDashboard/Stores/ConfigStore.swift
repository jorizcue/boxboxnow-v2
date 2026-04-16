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
    var activeSession: RaceSession?
    var teams: [Team] = []
    var isLoading: Bool = false
    var isLoadingSession: Bool = false
    var isLoadingTeams: Bool = false
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

    /// Fetches the current active race session from the server. `nil` is
    /// a valid result — the server returns JSON `null` or an empty body
    /// when the user hasn't created a session yet.
    func reloadActiveSession() async {
        isLoadingSession = true
        defer { isLoadingSession = false }
        do {
            activeSession = try await configService.activeSession()
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    /// Persists the form's RaceSession. If there is no active session yet,
    /// POSTs to create a new one; otherwise PATCHes the existing one. On
    /// success, replaces `activeSession` with the server's authoritative
    /// response and returns it so callers can apply the persisted state
    /// directly without re-reading the store (the store mutation and the
    /// caller's reaction are then on the same execution tick, which avoids
    /// a transient nil-activeSession flash on the form). Returns `nil` on
    /// failure; callers should inspect `lastError` for the user-facing
    /// message.
    func saveSession(_ draft: RaceSession) async -> RaceSession? {
        isLoadingSession = true
        defer { isLoadingSession = false }
        do {
            let saved: RaceSession
            if activeSession == nil {
                saved = try await configService.createSession(draft)
            } else {
                saved = try await configService.updateSession(draft)
            }
            activeSession = saved
            return saved
        } catch {
            lastError = ErrorMessages.userFacing(error)
            return nil
        }
    }

    /// Fetches the full team-positions list for the active session. Returns
    /// to an empty list and records `lastError` on failure (including the 404
    /// the server returns when there is no active session).
    func reloadTeams() async {
        isLoadingTeams = true
        defer { isLoadingTeams = false }
        do {
            teams = try await configService.teams()
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    /// Bulk-saves the draft list back to the server. On success, replaces
    /// `teams` with the server's authoritative response (which contains the
    /// new ids and final positions) and returns `true`. Returns `false` on
    /// failure; the caller should inspect `lastError` for the message.
    @discardableResult
    func saveTeams(_ draft: [Team]) async -> Bool {
        isLoadingTeams = true
        defer { isLoadingTeams = false }
        do {
            teams = try await configService.saveTeams(draft)
            return true
        } catch {
            lastError = ErrorMessages.userFacing(error)
            return false
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
        activeSession = nil
        teams = []
        isLoading = false
        isLoadingSession = false
        isLoadingTeams = false
        lastError = nil
    }
}
