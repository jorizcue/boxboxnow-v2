import SwiftUI

/// Config module shell with a secondary sidebar (`ConfigSidebar`) and a
/// detail pane that switches on the selected sub-tab. Phase A wires the
/// Sessions sub-tab to `SessionsView`; the other four show Phase-B
/// placeholders.
struct ConfigView: View {
    @State private var selection: ConfigSubTab = .sessions

    var body: some View {
        HStack(spacing: 0) {
            ConfigSidebar(selection: $selection)
            Divider().overlay(BBNColors.border)
            Group {
                switch selection {
                case .sessions:    SessionsView()
                case .teams:       TeamsView()
                case .circuits:    CircuitsView()
                case .presets:     PresetsView()
                case .preferences: PreferencesView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BBNColors.background)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Configuración")
    }
}
