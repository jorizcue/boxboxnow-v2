import SwiftUI

struct CardVisibilityView: View {
    @EnvironmentObject var driverVM: DriverViewModel

    var body: some View {
        List {
            ForEach(DriverCard.allCases) { card in
                Toggle(isOn: binding(for: card)) {
                    Label(card.displayName, systemImage: card.iconName)
                }
            }
        }
        .navigationTitle("Tarjetas visibles")
        .onDisappear { driverVM.saveConfig() }
    }

    private func binding(for card: DriverCard) -> Binding<Bool> {
        Binding(
            get: { driverVM.visibleCards[card.rawValue] ?? true },
            set: { driverVM.visibleCards[card.rawValue] = $0 }
        )
    }
}
