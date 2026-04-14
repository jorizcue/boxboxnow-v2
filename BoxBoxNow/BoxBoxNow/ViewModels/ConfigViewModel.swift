import Foundation
import Combine

final class ConfigViewModel: ObservableObject {
    @Published var session: RaceSession = .empty
    @Published var circuits: [Circuit] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    /// True when the user has an active session row on the backend.
    /// When false, saving must go through POST /config/session (create)
    /// instead of PATCH /config/session (update) — otherwise the backend
    /// returns 404 "No active session".
    @Published private(set) var hasActiveSession = false

    func loadSession() async {
        await MainActor.run { isLoading = true }
        do {
            if let s = try await APIClient.shared.getActiveSession() {
                await MainActor.run {
                    self.session = s
                    self.hasActiveSession = true
                    self.isLoading = false
                    print("[Config] Loaded session: kart=\(s.ourKartNumber), circuit=\(s.circuitId ?? -1), duration=\(s.durationMin)")
                }
            } else {
                await MainActor.run {
                    // Keep defaults from .empty so the form is usable.
                    self.hasActiveSession = false
                    self.isLoading = false
                    print("[Config] No active session on server — using defaults; will create on save")
                }
            }
        } catch {
            await MainActor.run {
                self.isLoading = false
                self.errorMessage = error.localizedDescription
            }
            print("[Config] Failed to load session: \(error)")
        }
    }

    func loadCircuits() async {
        do {
            let c = try await APIClient.shared.getMyCircuits()
            await MainActor.run {
                self.circuits = c
                // If we have no session yet and the user hasn't picked a
                // circuit, default to the first accessible one so POST has
                // a valid circuit_id to send.
                if !self.hasActiveSession, self.session.circuitId == nil, let first = c.first {
                    self.session.circuitId = first.id
                    self.session.circuitName = first.name
                }
            }
        } catch {
            print("[Config] Failed to load circuits: \(error)")
        }
    }

    func saveSession() async {
        do {
            let saved: RaceSession
            if hasActiveSession {
                saved = try await APIClient.shared.updateSession(session)
            } else {
                // First-time save — must create the session via POST so the
                // backend has a row to attach subsequent PATCHes to.
                guard session.circuitId != nil else {
                    await MainActor.run {
                        self.errorMessage = "Selecciona un circuito antes de guardar"
                    }
                    return
                }
                saved = try await APIClient.shared.createSession(session)
            }
            await MainActor.run {
                self.session = saved
                self.hasActiveSession = true
                print("[Config] Saved session OK: kart=\(saved.ourKartNumber)")
            }
        } catch {
            await MainActor.run { self.errorMessage = error.localizedDescription }
            print("[Config] Failed to save session: \(error)")
        }
    }
}
