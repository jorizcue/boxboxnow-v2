import SwiftUI

struct CardVisibilityView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var toast: ToastManager
    @EnvironmentObject var auth: AuthViewModel

    private var canBox: Bool {
        if auth.user?.isAdmin == true { return true }
        return auth.user?.tabAccess?.contains("app-config-box") == true
    }

    private var visibleGroups: [DriverCardGroup] {
        DriverCardGroup.allCases.filter { $0 != .box || canBox }
    }

    private func cards(in group: DriverCardGroup) -> [DriverCard] {
        // Plan-aware filter: only show cards present in the user's
        // `allowed_cards` whitelist resolved by the backend from the
        // active subscription's ProductTabConfig. Empty / nil list
        // falls back to the full catalog so older clients / admins /
        // trial users don't end up with an empty editor.
        let allowed = auth.user?.allowedCards
        let allowedSet: Set<String>? = (allowed?.isEmpty == false) ? Set(allowed!) : nil
        return DriverCard.allCases.filter { card in
            card.group == group && (allowedSet?.contains(card.rawValue) ?? true)
        }
    }

    private func sectionTitle(_ group: DriverCardGroup) -> String {
        switch group {
        case .raceApex: return "Carrera - Apex"
        case .raceBbn:  return "Carrera - BBN"
        case .box:      return "BOX"
        case .gps:      return "GPS (requieren RaceBox o GPS del telefono)"
        }
    }

    var body: some View {
        List {
            ForEach(visibleGroups, id: \.self) { group in
                let groupCards = cards(in: group)
                if !groupCards.isEmpty {
                    Section(sectionTitle(group)) {
                        ForEach(groupCards) { card in
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
            }
        }
        .navigationTitle("Tarjetas visibles")
        .onDisappear {
            driverVM.saveConfig()
            Task {
                do {
                    _ = try await APIClient.shared.updatePreferences(
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
