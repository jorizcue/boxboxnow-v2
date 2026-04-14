import SwiftUI

@main
struct BoxBoxNowApp: App {
    @UIApplicationDelegateAdaptor(BoxBoxNowAppDelegate.self) private var appDelegate
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
            .environmentObject(appState.toast)
            .toast(appState.toast)
            .preferredColorScheme(.dark)
            .alert("Activar \(BiometricService.biometricName)", isPresented: Binding(
                get: { appState.authVM.showBiometricPrompt },
                set: { appState.authVM.showBiometricPrompt = $0 }
            )) {
                Button("Activar") { appState.authVM.enableBiometric() }
                Button("Ahora no", role: .cancel) { appState.authVM.skipBiometric() }
            } message: {
                Text("Quieres usar \(BiometricService.biometricName) para iniciar sesion mas rapido?")
            }
        }
    }
}
