import SwiftUI

struct CardVisibilityView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var lang: LanguageStore

    var body: some View {
        List {
            ForEach(DriverCard.allCases) { card in
                Toggle(isOn: binding(for: card)) {
                    Label(t(card.i18nKey, lang.current), systemImage: card.iconName)
                }
            }
        }
        .navigationTitle(t("preset.visibleCards", lang.current))
        .onDisappear { driverVM.saveConfig() }
    }

    private func binding(for card: DriverCard) -> Binding<Bool> {
        Binding(
            get: { driverVM.visibleCards[card.rawValue] ?? true },
            set: { driverVM.visibleCards[card.rawValue] = $0 }
        )
    }
}
