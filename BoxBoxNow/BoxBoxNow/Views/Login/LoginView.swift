import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Text("BoxBoxNow")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.accentColor)

                Text("Driver View")
                    .font(.title3)
                    .foregroundColor(.gray)

                if authVM.showMfa {
                    mfaSection
                } else {
                    loginSection
                }

                Spacer()
            }
            .padding(.horizontal, 32)
        }
    }

    private var loginSection: some View {
        VStack(spacing: 16) {
            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.emailAddress)
                .autocapitalization(.none)
                .keyboardType(.emailAddress)

            SecureField("Contrasena", text: $password)
                .textFieldStyle(.roundedBorder)
                .textContentType(.password)

            if let error = authVM.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption)
            }

            Button(action: { authVM.login(email: email, password: password) }) {
                HStack {
                    if authVM.isLoading { ProgressView().tint(.black) }
                    Text("Iniciar sesion")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.accentColor)
                .foregroundColor(.black)
                .cornerRadius(10)
            }
            .disabled(authVM.isLoading || email.isEmpty || password.isEmpty)

            Button(action: { authVM.loginWithGoogle() }) {
                HStack {
                    Image(systemName: "globe")
                    Text("Continuar con Google")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.systemGray5))
                .foregroundColor(.white)
                .cornerRadius(10)
            }
        }
    }

    private var mfaSection: some View {
        VStack(spacing: 16) {
            Text("Verificacion en dos pasos")
                .font(.headline)
                .foregroundColor(.white)

            TextField("Codigo MFA", text: $authVM.mfaCode)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)

            Button(action: { authVM.verifyMfa(code: authVM.mfaCode) }) {
                Text("Verificar")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.black)
                    .cornerRadius(10)
            }
            .disabled(authVM.mfaCode.count < 6)

            Button("Volver") {
                authVM.showMfa = false
                authVM.tempToken = nil
            }
            .foregroundColor(.gray)
        }
    }
}
