import SwiftUI

struct ConfigView: View {
    @EnvironmentObject var auth: AuthViewModel
    @EnvironmentObject var langStore: LanguageStore

    private func canAccess(_ tab: String) -> Bool {
        if auth.user?.isAdmin == true { return true }
        return auth.user?.tabAccess?.contains(tab) == true
    }

    @ViewBuilder
    var body: some View {
        if auth.user == nil {
            VStack(spacing: 12) {
                ProgressView()
                Text(t("common.loading"))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(t("config.title"))
            .task { await auth.refreshMe() }
        } else {
            configList
        }
    }

    private var configList: some View {
        List {
            if canAccess("app-config-carrera") {
                NavigationLink(destination: SessionConfigView()) {
                    Label(t("config.session"), systemImage: "flag.checkered")
                }
            }
            if canAccess("app-config-box") {
                NavigationLink(destination: BoxConfigView()) {
                    Label(t("config.box"), systemImage: "wrench.and.screwdriver")
                }
            }
            if canAccess("app-config-plantillas") || canAccess("app-config-visualizacion") {
                NavigationLink(destination: PresetsView()) {
                    Label(t("config.presets"), systemImage: "doc.on.doc")
                }
            }
            if canAccess("app-config-gps-racebox") {
                NavigationLink(destination: GPSConfigView()) {
                    Label(t("config.gps"), systemImage: "location.fill")
                }
            }
        }
        .navigationTitle(t("config.title"))
        .listStyle(.insetGrouped)
    }
}
