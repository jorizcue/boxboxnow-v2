import SwiftUI

struct CardVisibilityView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var toast: ToastManager

    private var standardCards: [DriverCard] {
        DriverCard.allCases.filter { !$0.requiresGPS }
    }

    private var gpsCards: [DriverCard] {
        DriverCard.allCases.filter { $0.requiresGPS }
    }

    var body: some View {
        List {
            Section("Tarjetas estandar") {
                ForEach(standardCards) { card in
                    Toggle(isOn: binding(for: card)) {
                        HStack {
                            Image(systemName: card.iconName)
                                .foregroundColor(card.accentColor)
                                .frame(width: 24)
                            Text(card.displayName)
                        }
                    }
                }
            }

            Section("Tarjetas GPS (requieren RaceBox o GPS del telefono)") {
                ForEach(gpsCards) { card in
                    Toggle(isOn: binding(for: card)) {
                        HStack {
                            Image(systemName: card.iconName)
                                .foregroundColor(card.accentColor)
                                .frame(width: 24)
                            Text(card.displayName)
                        }
                    }
                }
            }
        }
        .navigationTitle("Tarjetas visibles")
        .onDisappear {
            driverVM.saveConfig()
            Task {
                do {
                    try await APIClient.shared.updatePreferences(
                        visibleCards: driverVM.visibleCards,
                        cardOrder: driverVM.cardOrder
                    )
                } catch {
                    await MainActor.run {
                        toast.warning("Guardado local OK, pero no se pudo sincronizar con el servidor")
                    }
                }
            }
        }
    }

    private func binding(for card: DriverCard) -> Binding<Bool> {
        Binding(
            get: { driverVM.visibleCards[card.rawValue] ?? true },
            set: { driverVM.visibleCards[card.rawValue] = $0 }
        )
    }
}
