import Foundation
import Observation

@Observable
@MainActor
final class AppStore {
    let auth: AuthStore
    let race: RaceStore
    let config: ConfigStore
    var admin: AdminStore?

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
                        await self.config.refresh()
                        if self.auth.user?.isAdmin == true {
                            self.admin = AdminStore()
                            await self.admin?.refreshAll()
                        }
                    case .loggedOut:
                        await self.race.disconnect()
                        self.admin = nil
                    default: break
                    }
                }
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }

        // Bridge RaceStore close → AuthStore logout for 4001/4003.
        reconnectBridgeTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                if case .sessionTerminated = self.race.reconnectReason ?? .normal {
                    await self.auth.logout()
                    self.race.reconnectReason = nil
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }
    }

    deinit {
        authStateObservation?.cancel()
        reconnectBridgeTask?.cancel()
    }
}
