import SwiftUI

struct MFACodeView: View {
    @Environment(AppStore.self) private var app
    @State private var code = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "lock.shield")
                .font(.system(size: 72))
                .foregroundColor(BBNColors.accent)
            Text("Verificación en dos pasos")
                .font(BBNTypography.title1)
                .foregroundColor(BBNColors.textPrimary)
            Text("Introduce el código de 6 dígitos de tu app de autenticación")
                .font(BBNTypography.body)
                .foregroundColor(BBNColors.textMuted)
                .multilineTextAlignment(.center)

            BBNCard {
                VStack(spacing: 16) {
                    TextField("000000", text: $code)
                        .keyboardType(.numberPad)
                        .font(BBNTypography.title1)
                        .monospacedDigit()
                        .multilineTextAlignment(.center)
                        .padding(8)
                        .background(BBNColors.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onChange(of: code) { _, new in
                            code = String(new.prefix(6).filter(\.isNumber))
                        }

                    if let err = errorMessage {
                        Text(err)
                            .font(BBNTypography.caption)
                            .foregroundColor(BBNColors.danger)
                    }

                    BBNPrimaryButton(title: "Verificar", isLoading: isAuthenticating) {
                        Task { await app.auth.verifyMFA(code: code) }
                    }
                    .disabled(code.count != 6)
                }
                .padding(8)
            }
            .frame(maxWidth: 400)
            Spacer()
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background.ignoresSafeArea())
        .onChange(of: app.auth.authState) { _, new in
            if case .loginFailed(let m) = new {
                errorMessage = m
            } else {
                errorMessage = nil
            }
        }
    }

    private var isAuthenticating: Bool {
        if case .authenticating = app.auth.authState { return true }
        return false
    }
}
