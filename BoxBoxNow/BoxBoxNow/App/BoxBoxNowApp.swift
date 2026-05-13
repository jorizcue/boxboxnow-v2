import SwiftUI

@main
struct BoxBoxNowApp: App {
    @UIApplicationDelegateAdaptor(BoxBoxNowAppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState()
    @StateObject private var langStore = LanguageStore.shared

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
            .environmentObject(appState.toast)
            .environmentObject(langStore)
            .toast(appState.toast)
            .preferredColorScheme(.dark)
        }
    }
}
