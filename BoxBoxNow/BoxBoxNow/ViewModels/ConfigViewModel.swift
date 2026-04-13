import Foundation
import Combine

final class ConfigViewModel: ObservableObject {
    @Published var session: RaceSession = .empty
    @Published var circuits: [Circuit] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func loadSession() async {
        await MainActor.run { isLoading = true }
        do {
            let s = try await APIClient.shared.getActiveSession()
            await MainActor.run {
                self.session = s
                self.isLoading = false
                print("[Config] Loaded session: kart=\(s.ourKartNumber), circuit=\(s.circuitId ?? -1), duration=\(s.durationMin)")
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
            await MainActor.run { self.circuits = c }
        } catch {
            print("[Config] Failed to load circuits: \(error)")
        }
    }

    func saveSession() async {
        do {
            let updated = try await APIClient.shared.updateSession(session)
            await MainActor.run {
                self.session = updated
                print("[Config] Saved session OK: kart=\(updated.ourKartNumber)")
            }
        } catch {
            await MainActor.run { self.errorMessage = error.localizedDescription }
            print("[Config] Failed to save session: \(error)")
        }
    }
}
