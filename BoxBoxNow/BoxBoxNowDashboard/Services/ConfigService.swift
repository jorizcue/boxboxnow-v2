import Foundation

struct LiveTimingURLResponse: Codable { let url: String }

struct ConfigService {
    let api = APIClient.shared

    func liveTimingURL() async throws -> String {
        let r: LiveTimingURLResponse = try await api.getJSON("/config/live-timing-url")
        return r.url
    }
    func circuits() async throws -> [Circuit] {
        try await api.getJSON("/config/circuits")
    }
    func selectCircuit(id: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/config/circuits/\(id)/select", body: EmptyBody())
    }
    func preferences() async throws -> DriverPreferences {
        try await api.getJSON("/config/preferences")
    }
    func updatePreferences(_ prefs: DriverPreferences) async throws -> DriverPreferences {
        try await api.patchJSON("/config/preferences", body: prefs)
    }
    func presets() async throws -> [DriverConfigPreset] {
        try await api.getJSON("/config/presets")
    }
    func createPreset(_ preset: DriverConfigPreset) async throws -> DriverConfigPreset {
        try await api.postJSON("/config/presets", body: preset)
    }
    func updatePreset(_ preset: DriverConfigPreset) async throws -> DriverConfigPreset {
        try await api.patchJSON("/config/presets/\(preset.id)", body: preset)
    }
    func deletePreset(id: Int) async throws {
        try await api.deleteJSON("/config/presets/\(id)")
    }

    // MARK: - Race Session (singular active session per user)

    /// GET `/config/session` — may return `nil` if the user has no active
    /// session. Uses the optional-body helper because the server legitimately
    /// returns empty body or JSON `null` in that case.
    func activeSession() async throws -> RaceSession? {
        try await api.getJSONOptional("/config/session")
    }

    /// POST `/config/session` — creates a new active session, deactivating any
    /// existing one. Server returns the persisted session.
    func createSession(_ session: RaceSession) async throws -> RaceSession {
        try await api.postJSON("/config/session", body: session)
    }

    /// PATCH `/config/session` — updates the current active session in place.
    /// 404s if no active session exists; callers must use `createSession` when
    /// `activeSession()` returned nil.
    func updateSession(_ session: RaceSession) async throws -> RaceSession {
        try await api.patchJSON("/config/session", body: session)
    }
}
