import SwiftUI

/// Router view for the pre-authenticated states. `RootView` (Task 15) will
/// render this OR the main navigation shell based on whether the user is
/// logged in. The `.loggedIn` case here is a fallthrough no-op — RootView
/// won't instantiate AuthFlowView when authState is `.loggedIn`.
struct AuthFlowView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        ZStack {
            switch app.auth.authState {
            case .loggedOut, .loginFailed, .authenticating:
                LoginView()
            case .needsMFACode:
                MFACodeView()
            case .needsMFASetup(let otp):
                MFASetupView(otpAuthURL: otp)
            case .loggedIn:
                Color.clear // RootView (Task 15) handles this case
            }
            if case .authenticating = app.auth.authState {
                BBNLoadingOverlay(isVisible: true)
            }
        }
    }
}
