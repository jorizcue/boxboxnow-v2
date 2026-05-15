import SwiftUI

struct HomeView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var lang: LanguageStore
    @State private var showDriver = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 24) {
                    Spacer()

                    NavigationLink(destination: ConfigView()) {
                        HomeCard(
                            icon: "gearshape.fill",
                            title: t("home.config", lang.current),
                            subtitle: t("home.configSubtitle", lang.current)
                        )
                    }

                    Button(action: { showDriver = true }) {
                        HomeCard(
                            icon: "gauge.open.with.lines.needle.33percent.and.arrowtriangle",
                            title: t("home.driverView", lang.current),
                            subtitle: t("home.fullScreen", lang.current)
                        )
                    }
                    .fullScreenCover(isPresented: $showDriver) {
                        DriverView()
                    }

                    Spacer()
                }
                .padding(.horizontal, 24)
            }
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Text(authVM.user?.name ?? "")
                        .foregroundColor(.gray)
                }
                // Language picker — flag-only trigger that opens a menu
                // with all five supported languages. Sits between the
                // user-name badge (left) and Sign-out (right).
                ToolbarItem(placement: .navigationBarTrailing) {
                    LanguagePicker()
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(t("common.signOut", lang.current)) { authVM.logout() }
                        .foregroundColor(.red)
                }
            }
        }
    }
}

struct HomeCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 32))
                .foregroundColor(.accentColor)
                .frame(width: 60)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.title2.bold())
                    .foregroundColor(.white)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundColor(.gray)
        }
        .padding(20)
        .background(Color(.systemGray6))
        .cornerRadius(16)
    }
}
