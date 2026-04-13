import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    private enum Field { case email, password, mfa }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if authVM.biometricPending {
                // Waiting for Face ID / Touch ID
                biometricWaitingView
            } else {
                ScrollView {
                    VStack(spacing: 24) {
                        Spacer(minLength: 60)

                        // Branding
                        VStack(spacing: 6) {
                            HStack(spacing: 0) {
                                Text("BB")
                                    .font(.system(size: 48, weight: .black, design: .rounded))
                                    .foregroundColor(.white)
                                Text("N")
                                    .font(.system(size: 48, weight: .black, design: .rounded))
                                    .foregroundColor(.accentColor)
                            }

                            HStack(spacing: 0) {
                                Text("BOXBOX")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundColor(.white)
                                Text("NOW")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundColor(.accentColor)
                            }

                            Text("Vista Piloto")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                        .padding(.bottom, 12)

                        if authVM.showMfa {
                            mfaSection
                        } else {
                            loginSection
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 32)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        // Biometric prompt alert is shown at app root level (BoxBoxNowApp)
        // to survive the LoginView → HomeView transition
    }

    // MARK: - Biometric waiting screen

    private var biometricWaitingView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: BiometricService.iconName)
                .font(.system(size: 64))
                .foregroundColor(.accentColor)

            Text("Verificando identidad...")
                .font(.title3)
                .foregroundColor(.white)

            // Retry button in case Face ID was dismissed
            Button(action: {
                Task { await authVM.authenticateWithBiometric() }
            }) {
                Text("Reintentar \(BiometricService.biometricName)")
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color.accentColor)
                    .foregroundColor(.black)
                    .cornerRadius(10)
            }
            .padding(.horizontal, 48)

            Button("Usar contrasena") {
                authVM.biometricPending = false
            }
            .frame(minHeight: 44)
            .foregroundColor(.gray)

            Spacer()
        }
    }

    // MARK: - Login form

    private var loginSection: some View {
        VStack(spacing: 16) {
            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.emailAddress)
                .autocapitalization(.none)
                .keyboardType(.emailAddress)
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }
                .accessibilityLabel("Email")

            SecureField("Contrasena", text: $password)
                .textFieldStyle(.roundedBorder)
                .textContentType(.password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit {
                    if !email.isEmpty && !password.isEmpty {
                        authVM.login(email: email, password: password)
                    }
                }
                .accessibilityLabel("Contraseña")

            if let error = authVM.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption)
                    .accessibilityLabel("Error: \(error)")
            }

            Button(action: { authVM.login(email: email, password: password) }) {
                HStack {
                    if authVM.isLoading { ProgressView().tint(.black) }
                    Text("Iniciar sesion")
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color.accentColor)
                .foregroundColor(.black)
                .cornerRadius(10)
            }
            .disabled(authVM.isLoading || email.isEmpty || password.isEmpty)
            .accessibilityLabel("Iniciar sesion")

            Button(action: {
                authVM.isGoogleLoading = true
                authVM.loginWithGoogle()
            }) {
                HStack {
                    if authVM.isGoogleLoading {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "globe")
                    }
                    Text("Continuar con Google")
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color(.systemGray5))
                .foregroundColor(.white)
                .cornerRadius(10)
            }
            .disabled(authVM.isLoading || authVM.isGoogleLoading)
            .accessibilityLabel("Continuar con Google")

            // Biometric quick-login (if enabled and token exists)
            if BiometricService.isEnabled && BiometricService.isAvailable && KeychainHelper.loadToken() != nil {
                Button(action: {
                    authVM.biometricPending = true
                    Task { await authVM.authenticateWithBiometric() }
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: BiometricService.iconName)
                        Text("Entrar con \(BiometricService.biometricName)")
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color(.systemGray5))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .accessibilityLabel("Iniciar sesion con \(BiometricService.biometricName)")
            }
        }
    }

    // MARK: - MFA

    private var mfaSection: some View {
        VStack(spacing: 16) {
            Text("Verificacion en dos pasos")
                .font(.headline)
                .foregroundColor(.white)

            TextField("Codigo MFA", text: $authVM.mfaCode)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)
                .focused($focusedField, equals: .mfa)
                .accessibilityLabel("Codigo de verificacion")
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("OK") { focusedField = nil }
                    }
                }

            Button(action: { authVM.verifyMfa(code: authVM.mfaCode) }) {
                Text("Verificar")
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color.accentColor)
                    .foregroundColor(.black)
                    .cornerRadius(10)
            }
            .disabled(authVM.mfaCode.count < 6)

            Button("Volver") {
                authVM.showMfa = false
                authVM.tempToken = nil
            }
            .frame(minHeight: 44)
            .foregroundColor(.gray)
        }
    }
}
