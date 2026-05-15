import SwiftUI

@main
struct BoxBoxNowApp: App {
    @StateObject private var appState = AppState()
    // Single source of truth for the active UI language. Every view
    // that calls `t(..)` reads `LanguageStore.current` through this
    // environment object, so flipping the language in the toolbar
    // picker re-renders the whole view tree at once.
    @StateObject private var languageStore = LanguageStore.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.authVM.isAuthenticated {
                    HomeView()
                } else {
                    LoginView()
                }
            }
            .environmentObject(appState.authVM)
            .environmentObject(appState.raceVM)
            .environmentObject(appState.driverVM)
            .environmentObject(appState.configVM)
            .environmentObject(appState.gpsVM)
            .environmentObject(languageStore)
            .preferredColorScheme(.dark)
        }
    }
}
