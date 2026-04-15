import SwiftUI

struct LoginView: View {
    @Environment(AppStore.self) private var app

    @State private var email = ""
    @State private var password = ""
    @State private var isGoogleLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("BoxBoxNow")
                .font(BBNTypography.title1)
                .foregroundColor(BBNColors.accent)
            Text("Dashboard")
                .font(BBNTypography.title2)
                .foregroundColor(BBNColors.textMuted)

            BBNCard {
                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    SecureField("Contraseña", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.password)

                    if let err = errorMessage {
                        Text(err)
                            .font(BBNTypography.caption)
                            .foregroundColor(BBNColors.danger)
                    }

                    BBNPrimaryButton(title: "Entrar", isLoading: isAuthenticating) {
                        Task { await app.auth.login(email: email, password: password) }
                    }
                    .disabled(email.isEmpty || password.isEmpty)

                    BBNSecondaryButton(title: "Continuar con Google", icon: "g.circle") {
                        Task { await startGoogle() }
                    }
                    .disabled(isGoogleLoading)
                }
                .padding(8)
            }
            .frame(maxWidth: 400)

            Spacer()
            Text("v1.0.0")
                .font(BBNTypography.caption)
                .foregroundColor(BBNColors.textDim)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background.ignoresSafeArea())
        .onChange(of: app.auth.authState) { _, new in
            if case .loginFailed(let msg) = new {
                errorMessage = msg
            } else {
                errorMessage = nil
            }
        }
    }

    private var isAuthenticating: Bool {
        if case .authenticating = app.auth.authState { return true }
        return false
    }

    private func startGoogle() async {
        isGoogleLoading = true
        defer { isGoogleLoading = false }
        do {
            let token = try await GoogleOAuthFlow().start()
            await app.auth.loginWithExistingToken(token)
        } catch let err as GoogleOAuthError {
            switch err {
            case .cancelled:
                // User explicitly cancelled — silent, matches driver app UX
                errorMessage = nil
            case .noToken:
                errorMessage = "No se recibió token de autenticación"
            case .backendError(let msg):
                errorMessage = msg
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
