import SwiftUI

@main
struct BoxBoxNowDashboardApp: App {
    @State private var app = AppStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if case .loggedIn = app.auth.authState {
                    RootView()
                } else {
                    AuthFlowView()
                } 
            }
            .environment(app)
            .preferredColorScheme(.dark)
            .tint(BBNColors.accent)
        }
    }
}
