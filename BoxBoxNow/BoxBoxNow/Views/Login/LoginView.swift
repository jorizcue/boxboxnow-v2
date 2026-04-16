import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    var body: some View {
        ZStack {
            // Background: dark with subtle racing-inspired gradient
            LinearGradient(
                colors: [Color(red: 0.04, green: 0.06, blue: 0.04), .black, Color(red: 0.02, green: 0.03, blue: 0.02)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Subtle grid pattern overlay
            GeometryReader { geo in
                Canvas { context, size in
                    let spacing: CGFloat = 40
                    for x in stride(from: 0, through: size.width, by: spacing) {
                        var path = Path()
                        path.move(to: CGPoint(x: x, y: 0))
                        path.addLine(to: CGPoint(x: x, y: size.height))
                        context.stroke(path, with: .color(.white.opacity(0.015)), lineWidth: 0.5)
                    }
                    for y in stride(from: 0, through: size.height, by: spacing) {
                        var path = Path()
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: size.width, y: y))
                        context.stroke(path, with: .color(.white.opacity(0.015)), lineWidth: 0.5)
                    }
                }
                .ignoresSafeArea()
                .allowsHitTesting(false)
            }

            if authVM.biometricPending {
                biometricWaitingView
            } else {
                ScrollView {
                    VStack(spacing: 28) {
                        Spacer(minLength: 60)

                        // ── Branding ──
                        VStack(spacing: 8) {
                            HStack(spacing: 0) {
                                Text("BB")
                                    .font(.system(size: 56, weight: .black, design: .rounded))
                                    .foregroundColor(.white)
                                Text("N")
                                    .font(.system(size: 56, weight: .black, design: .rounded))
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

                            Text("VISTA PILOTO")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Color(.systemGray2))
                                .tracking(3)
                                .padding(.top, 2)
                        }
                        .padding(.bottom, 8)

                        loginSection

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 32)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        // Biometric prompt alert is shown at app root level (BoxBoxNowApp)
    }

    // MARK: - Biometric waiting screen

    private var biometricWaitingView: some View {
        VStack(spacing: 28) {
            Spacer()

            Image(systemName: BiometricService.iconName)
                .font(.system(size: 64))
                .foregroundColor(.accentColor)
                .shadow(color: .accentColor.opacity(0.3), radius: 20)

            Text("Verificando identidad...")
                .font(.title3.bold())
                .foregroundColor(.white)

            Button(action: {
                Task { await authVM.authenticateWithBiometric() }
            }) {
                Text("Reintentar \(BiometricService.biometricName)")
                    .font(.headline)
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
        VStack(spacing: 14) {
            // Custom styled email field
            HStack(spacing: 12) {
                Image(systemName: "envelope")
                    .foregroundColor(Color(.systemGray3))
                    .frame(width: 20)
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .autocapitalization(.none)
                    .keyboardType(.emailAddress)
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .foregroundColor(.white)
            }
            .padding(14)
            .background(Color(.systemGray6))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(focusedField == .email ? Color.accentColor.opacity(0.5) : Color.clear, lineWidth: 1)
            )
            .accessibilityLabel("Email")

            // Custom styled password field
            HStack(spacing: 12) {
                Image(systemName: "lock")
                    .foregroundColor(Color(.systemGray3))
                    .frame(width: 20)
                SecureField("Contrasena", text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit {
                        if !email.isEmpty && !password.isEmpty {
                            authVM.login(email: email, password: password)
                        }
                    }
                    .foregroundColor(.white)
            }
            .padding(14)
            .background(Color(.systemGray6))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(focusedField == .password ? Color.accentColor.opacity(0.5) : Color.clear, lineWidth: 1)
            )
            .accessibilityLabel("Contrasena")

            if let error = authVM.errorMessage {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 12))
                    Text(error)
                        .font(.caption)
                }
                .foregroundColor(.red)
                .accessibilityLabel("Error: \(error)")
            }

            Button(action: { authVM.login(email: email, password: password) }) {
                HStack {
                    if authVM.isLoading { ProgressView().tint(.black) }
                    Text("Iniciar sesion")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color.accentColor)
                .foregroundColor(.black)
                .cornerRadius(10)
            }
            .disabled(authVM.isLoading || email.isEmpty || password.isEmpty)
            .accessibilityLabel("Iniciar sesion")
            .padding(.top, 4)

            // Divider
            HStack {
                Rectangle().fill(Color(.systemGray5)).frame(height: 0.5)
                Text("o")
                    .font(.caption)
                    .foregroundColor(Color(.systemGray3))
                    .padding(.horizontal, 8)
                Rectangle().fill(Color(.systemGray5)).frame(height: 0.5)
            }
            .padding(.vertical, 4)

            Button(action: {
                authVM.isGoogleLoading = true
                authVM.loginWithGoogle()
            }) {
                HStack(spacing: 8) {
                    if authVM.isGoogleLoading {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "globe")
                    }
                    Text("Continuar con Google")
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color(.systemGray6))
                .foregroundColor(.white)
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color(.systemGray4), lineWidth: 0.5)
                )
            }
            .disabled(authVM.isLoading || authVM.isGoogleLoading)
            .accessibilityLabel("Continuar con Google")

            // Biometric quick-login
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
                    .background(Color(.systemGray6))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.accentColor.opacity(0.3), lineWidth: 0.5)
                    )
                }
                .accessibilityLabel("Iniciar sesion con \(BiometricService.biometricName)")
            }
        }
    }

}
