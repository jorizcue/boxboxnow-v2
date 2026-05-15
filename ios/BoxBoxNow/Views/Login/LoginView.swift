import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var lang: LanguageStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Language picker available even before login, so a
            // non-Spanish-speaking user can read the form. Placed in
            // the top-trailing corner with a translucent backdrop so
            // it doesn't dominate the splash layout.
            VStack {
                HStack {
                    Spacer()
                    LanguagePicker()
                        .padding(.trailing, 16)
                        .padding(.top, 16)
                }
                Spacer()
            }

            VStack(spacing: 24) {
                Spacer()

                Text("BoxBoxNow")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.accentColor)

                Text(t("home.driverView", lang.current))
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
            TextField(t("login.email", lang.current), text: $email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.emailAddress)
                .autocapitalization(.none)
                .keyboardType(.emailAddress)

            SecureField(t("login.password", lang.current), text: $password)
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
                    Text(t("login.signIn", lang.current))
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
                    Text(t("login.googleSso", lang.current))
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
            Text(t("login.mfaTitle", lang.current))
                .font(.headline)
                .foregroundColor(.white)

            TextField(t("login.mfaCode", lang.current), text: $authVM.mfaCode)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)

            Button(action: { authVM.verifyMfa(code: authVM.mfaCode) }) {
                Text(t("login.verify", lang.current))
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.black)
                    .cornerRadius(10)
            }
            .disabled(authVM.mfaCode.count < 6)

            Button(t("common.back", lang.current)) {
                authVM.showMfa = false
                authVM.tempToken = nil
            }
            .foregroundColor(.gray)
        }
    }
}
