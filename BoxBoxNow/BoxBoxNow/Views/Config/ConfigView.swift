import SwiftUI

struct ConfigView: View {
    @EnvironmentObject var auth: AuthViewModel

    private func canAccess(_ tab: String) -> Bool {
        if auth.user?.isAdmin == true { return true }
        return auth.user?.tabAccess?.contains(tab) == true
    }

    @ViewBuilder
    var body: some View {
        if auth.user == nil {
            VStack(spacing: 12) {
                ProgressView()
                Text("Cargando permisos...")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Configuracion")
            .task { await auth.refreshMe() }
        } else {
            configList
        }
    }

    private var configList: some View {
        List {
            if canAccess("app-config-carrera") {
                NavigationLink(destination: SessionConfigView()) {
                    Label("Carrera", systemImage: "flag.checkered")
                }
            }
            if canAccess("app-config-box") {
                NavigationLink(destination: BoxConfigView()) {
                    Label("Box", systemImage: "wrench.and.screwdriver")
                }
            }
            if canAccess("app-config-plantillas") || canAccess("app-config-visualizacion") {
                NavigationLink(destination: PresetsView()) {
                    Label("Plantillas", systemImage: "doc.on.doc")
                }
            }
            if canAccess("app-config-gps-racebox") {
                NavigationLink(destination: GPSConfigView()) {
                    Label("GPS / RaceBox", systemImage: "location.fill")
                }
            }
        }
        .navigationTitle("Configuracion")
        .listStyle(.insetGrouped)
    }
}
