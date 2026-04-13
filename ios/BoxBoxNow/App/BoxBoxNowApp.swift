import SwiftUI

@main
struct BoxBoxNowApp: App {
    @StateObject private var appState = AppState()

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
            .preferredColorScheme(.dark)
        }
    }
}
