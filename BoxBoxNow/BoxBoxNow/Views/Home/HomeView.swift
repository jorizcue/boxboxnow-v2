import SwiftUI

struct HomeView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var configVM: ConfigViewModel
    @EnvironmentObject var raceVM: RaceViewModel
    @State private var showDriver = false

    private var hasSession: Bool {
        configVM.session.ourKartNumber > 0 && configVM.session.durationMin > 0
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // ── Branding ──
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
                        .padding(.top, 32)

                        // ── User row ──
                        if let name = authVM.user?.displayName, !name.isEmpty {
                            HStack(spacing: 6) {
                                Image(systemName: "person.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(.accentColor)
                                Text(name)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(.white)
                            }
                            .padding(.bottom, 8)
                        } else {
                            Spacer().frame(height: 8)
                        }

                        // ── Session summary card ──
                        if hasSession {
                            NavigationLink(destination: SessionConfigView()) {
                                SessionSummaryCard(session: configVM.session, circuits: configVM.circuits)
                            }
                        } else {
                            VStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle")
                                    .font(.system(size: 24))
                                    .foregroundColor(.orange)
                                Text("Configura la sesion antes de entrar")
                                    .font(.subheadline)
                                    .foregroundColor(.orange)
                                Text("Necesitas definir al menos el kart y la duracion")
                                    .font(.caption)
                                    .foregroundColor(Color(.systemGray3))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.orange.opacity(0.08))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                                    )
                            )
                        }

                        // ── Action cards ──
                        NavigationLink(destination: ConfigView()) {
                            HomeCard(
                                icon: "gearshape.fill",
                                title: "Configuracion",
                                subtitle: "Carrera, Plantillas, GPS"
                            )
                        }

                        Button(action: { showDriver = true }) {
                            HomeCard(
                                icon: "gauge.open.with.lines.needle.33percent.and.arrowtriangle",
                                title: "Vista Piloto",
                                subtitle: hasSession
                                    ? "Kart #\(configVM.session.ourKartNumber) · \(configVM.session.durationMin) min"
                                    : "Pantalla completa",
                                accentBorder: true
                            )
                        }
                        .fullScreenCover(isPresented: $showDriver) {
                            DriverView()
                        }

                        Spacer(minLength: 24)
                    }
                    .padding(.horizontal, 24)
                }
            }
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Circle()
                        .fill(raceVM.isConnected ? Color.green : Color(.systemGray4))
                        .frame(width: 8, height: 8)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Salir") { authVM.logout() }
                        .foregroundColor(.red)
                        .frame(minHeight: 44)
                        .accessibilityLabel("Cerrar sesion")
                }
            }
            .task {
                await configVM.loadSession()
                await configVM.loadCircuits()
            }
        }
    }
}

// MARK: - Session Summary Card

struct SessionSummaryCard: View {
    let session: RaceSession
    let circuits: [Circuit]

    private var circuitName: String {
        circuits.first(where: { $0.id == session.circuitId })?.name ?? "Sin circuito"
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("SESION ACTIVA")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.accentColor)
                    .tracking(1)
                Spacer()
                Image(systemName: "flag.checkered")
                    .foregroundColor(Color(.systemGray3))
                    .font(.system(size: 14))
            }

            HStack(spacing: 16) {
                SessionInfoPill(label: "KART", value: "#\(session.ourKartNumber)", accent: true)
                SessionInfoPill(label: "DURACION", value: "\(session.durationMin) min")
                SessionInfoPill(label: "PITS", value: "\(session.minPits)")
            }

            HStack(spacing: 16) {
                SessionInfoPill(label: "CIRCUITO", value: circuitName)
                SessionInfoPill(label: "MAX STINT", value: "\(session.maxStintMin) min")
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.accentColor.opacity(0.2), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sesion activa: Kart \(session.ourKartNumber), \(circuitName), \(session.durationMin) minutos")
    }
}

struct SessionInfoPill: View {
    let label: String
    let value: String
    var accent: Bool = false

    var body: some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(Color(.systemGray3))
                .tracking(0.5)
            Text(value)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(accent ? .accentColor : .white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Home Card

struct HomeCard: View {
    let icon: String
    let title: String
    let subtitle: String
    var accentBorder: Bool = false

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
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemGray6))
                .overlay(
                    accentBorder
                        ? RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.accentColor.opacity(0.25), lineWidth: 1)
                        : nil
                )
        )
        .accessibilityElement(children: .combine)
    }
}
