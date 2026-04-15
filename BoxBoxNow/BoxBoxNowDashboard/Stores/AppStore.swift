import Foundation
import Observation

@Observable
@MainActor
final class AppStore {
    let auth: AuthStore
    let race: RaceStore
    let config: ConfigStore
    var admin: AdminStore?

    // Phase A: busy-poll to observe cross-store transitions. Phase B will
    // replace both loops with `withObservationTracking` signals so the
    // observer wakes only when state actually changes.
    private static let authPollIntervalNs: UInt64 = 50_000_000   // 50ms = 20Hz
    private static let reconnectBridgePollIntervalNs: UInt64 = 100_000_000  // 100ms = 10Hz

    // nonisolated(unsafe) so deinit (nonisolated) can cancel these without
    // tripping Swift 6 actor-isolation checks. The tasks themselves only
    // mutate their own local state through [weak self] hops, so there's no
    // data race even though the storage is nonisolated.
    nonisolated(unsafe) private var reconnectBridgeTask: Task<Void, Never>?
    nonisolated(unsafe) private var authStateObservation: Task<Void, Never>?

    init() {
        let keychain = RealKeychain()
        let authService = AuthService()
        self.auth = AuthStore(service: authService, keychain: keychain)
        self.race = RaceStore()
        self.config = ConfigStore()
        self.admin = nil

        bootstrap()
        observeAuthState()
    }

    private func bootstrap() {
        Task { await auth.bootstrap() }
    }

    private func observeAuthState() {
        // When the user becomes logged in, connect the race WS and load config.
        authStateObservation = Task { [weak self] in
            guard let self else { return }
            var lastState: AuthStore.AuthState = .loggedOut
            while !Task.isCancelled {
                let current = self.auth.authState
                if current != lastState {
                    lastState = current
                    switch current {
                    case .loggedIn:
                        if let token = RealKeychain().loadToken() {
                            await self.race.connect(token: token)
                        }
                        // TOCTOU guard: the `.authExpired` notification observer
                        // can flip authState back to .loggedOut between suspension
                        // points. Re-check after every await so we don't write
                        // stale config or spin up an orphaned AdminStore on an
                        // invalid token. The outer while-loop picks up the new
                        // state on the next tick.
                        guard self.auth.authState == .loggedIn else { break }
                        await self.config.refresh()
                        guard self.auth.authState == .loggedIn else { break }
                        if self.auth.user?.isAdmin == true {
                            self.admin = AdminStore()
                            await self.admin?.refreshAll()
                        }
                    case .loggedOut:
                        await self.race.disconnect()
                        self.race.reset()
                        self.config.reset()
                        self.admin = nil
                    default: break
                    }
                }
                try? await Task.sleep(nanoseconds: Self.authPollIntervalNs)
            }
        }

        // Bridge RaceStore close → AuthStore logout for 4001/4003.
        reconnectBridgeTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                if self.race.reconnectReason == .sessionTerminated {
                    await self.auth.logout()
                    self.race.reconnectReason = nil
                }
                try? await Task.sleep(nanoseconds: Self.reconnectBridgePollIntervalNs)
            }
        }
    }

    /// Cancellation is safe even if a loop iteration is currently running:
    /// child stores (`auth`, `race`, `config`) are strong properties of self,
    /// so they outlive any in-flight observer body. The next `Task.sleep` throws
    /// `CancellationError` and the loop exits cleanly.
    deinit {
        authStateObservation?.cancel()
        reconnectBridgeTask?.cancel()
    }
}
