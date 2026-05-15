import SwiftUI

struct ConfigView: View {
    @EnvironmentObject var lang: LanguageStore

    var body: some View {
        List {
            NavigationLink(destination: SessionConfigView()) {
                Label(t("config.session", lang.current), systemImage: "flag.checkered")
            }
            NavigationLink(destination: CardVisibilityView()) {
                Label(t("preset.visibleCards", lang.current), systemImage: "eye")
            }
            NavigationLink(destination: CardOrderPreviewView()) {
                Label(t("preset.orderAndPreview", lang.current), systemImage: "arrow.up.arrow.down")
            }
            NavigationLink(destination: PresetsView()) {
                Label(t("preset.titlePlural", lang.current), systemImage: "doc.on.doc")
            }
            NavigationLink(destination: GPSConfigView()) {
                Label(t("config.gps", lang.current), systemImage: "location.fill")
            }
        }
        .navigationTitle(t("home.config", lang.current))
        .listStyle(.insetGrouped)
    }
}
