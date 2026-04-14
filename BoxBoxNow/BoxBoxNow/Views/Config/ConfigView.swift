import SwiftUI

struct ConfigView: View {
    @EnvironmentObject var auth: AuthViewModel

    private func canAccess(_ tab: String) -> Bool {
        if auth.user?.isAdmin == true { return true }
        return auth.user?.tabAccess?.contains(tab) == true
    }

    var body: some View {
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
            if canAccess("app-config-visualizacion") {
                NavigationLink(destination: CardVisibilityView()) {
                    Label("Visualización — Tarjetas", systemImage: "eye")
                }
                NavigationLink(destination: CardOrderPreviewView()) {
                    Label("Visualización — Orden", systemImage: "arrow.up.arrow.down")
                }
            }
            if canAccess("app-config-plantillas") {
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
