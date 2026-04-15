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
}
