import SwiftUI

struct ConfigView: View {
    var body: some View {
        List {
            NavigationLink(destination: SessionConfigView()) {
                Label("Sesion", systemImage: "flag.checkered")
            }
            NavigationLink(destination: CardVisibilityView()) {
                Label("Tarjetas visibles", systemImage: "eye")
            }
            NavigationLink(destination: CardOrderPreviewView()) {
                Label("Orden y vista previa", systemImage: "arrow.up.arrow.down")
            }
            NavigationLink(destination: PresetsView()) {
                Label("Plantillas", systemImage: "doc.on.doc")
            }
            NavigationLink(destination: GPSConfigView()) {
                Label("GPS / RaceBox", systemImage: "location.fill")
            }
        }
        .navigationTitle("Configuracion")
        .listStyle(.insetGrouped)
    }
}
