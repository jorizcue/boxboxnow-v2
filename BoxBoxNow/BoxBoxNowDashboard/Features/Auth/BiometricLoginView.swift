import SwiftUI

/// Shown on launch when a cached token exists and the user has opted in to
/// biometric auth. Success: calls AppStore to validate and enter the app.
/// Failure: posts `.authExpired` which triggers `AuthStore.handleAuthExpired()`
/// — symmetric with the 401 code path, clearing keychain/user/pendingEmail
/// and flipping `authState` to `.loggedOut` so `AuthFlowView` shows `LoginView`.
struct BiometricLoginView: View {
    @Environment(AppStore.self) private var app
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: BiometricService.iconName)
                .font(.system(size: 96))
                .foregroundColor(BBNColors.accent)
            Text("Verificando identidad…")
                .font(BBNTypography.body)
                .foregroundColor(BBNColors.textMuted)
            if let errorMessage {
                Text(errorMessage)
                    .font(BBNTypography.caption)
                    .foregroundColor(BBNColors.danger)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background.ignoresSafeArea())
        .task {
            let ok = await BiometricService.authenticate()
            if ok, let token = KeychainHelper.loadToken() {
                await app.auth.loginWithExistingToken(token)
            } else {
                errorMessage = "No se pudo verificar. Usa tu contraseña."
                // Fall back to LoginView by going through the same cleanup
                // path as a 401: clears keychain, user, pendingEmail, state.
                NotificationCenter.default.post(name: .authExpired, object: nil)
            }
        }
    }
}
