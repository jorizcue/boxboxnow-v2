import Foundation

struct RaceService {
    let api = APIClient.shared

    func snapshot() async throws -> RaceSnapshot {
        try await api.getJSON("/race/snapshot")
    }
    func config() async throws -> RaceConfig {
        try await api.getJSON("/race/config")
    }
    func updateConfig(_ cfg: RaceConfig) async throws -> RaceConfig {
        try await api.patchJSON("/race/config", body: cfg)
    }
    func resetRace() async throws {
        let _: EmptyBody = try await api.postJSON("/race/reset", body: EmptyBody())
    }
    func teams() async throws -> [Team] {
        try await api.getJSON("/race/teams")
    }
    func updateTeam(_ team: Team) async throws -> Team {
        // TODO(dashboard): backend route for single-team PATCH is TBD — keyed by
        // kart number for now since `Team.id` is a client-side UUID. Revisit once
        // Task 21's Teams sub-tab lands and the real contract is defined.
        try await api.patchJSON("/race/teams/\(team.kart)", body: team)
    }
}
