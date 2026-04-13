import SwiftUI

struct HomeView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var showDriver = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 24) {
                    Spacer()

                    // ── Branding (matches web login header) ──
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

                        Text("ESTRATEGIA DE KARTING EN TIEMPO REAL")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(.systemGray))
                            .tracking(1.5)
                    }
                    .padding(.bottom, 12)

                    Spacer()

                    NavigationLink(destination: ConfigView()) {
                        HomeCard(
                            icon: "gearshape.fill",
                            title: "Configuracion",
                            subtitle: "Sesion, tarjetas, GPS"
                        )
                    }

                    Button(action: { showDriver = true }) {
                        HomeCard(
                            icon: "gauge.open.with.lines.needle.33percent.and.arrowtriangle",
                            title: "Vista Piloto",
                            subtitle: "Pantalla completa"
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
                    Text(authVM.user?.displayName ?? "")
                        .foregroundColor(.gray)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Salir") { authVM.logout() }
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
