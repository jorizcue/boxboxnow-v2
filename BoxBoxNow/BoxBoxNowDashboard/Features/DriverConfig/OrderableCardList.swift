import SwiftUI

/// Reorderable list of driver-view cards with per-card visibility toggles.
/// Uses SwiftUI's built-in `.onMove` for drag-and-drop reordering, with
/// `editMode` permanently active so the drag handles are always visible.
struct OrderableCardList: View {
    @Binding var cardOrder: [String]
    @Binding var visibleCards: [String: Bool]

    var body: some View {
        List {
            ForEach(cardOrder, id: \.self) { cardId in
                HStack(spacing: 12) {
                    Image(systemName: "line.3.horizontal")
                        .foregroundStyle(BBNColors.textMuted)
                    Text(DriverCardCatalog.label(for: cardId))
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    Toggle("", isOn: toggleBinding(for: cardId))
                        .labelsHidden()
                        .tint(BBNColors.accent)
                }
                .listRowBackground(BBNColors.surface)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(DriverCardCatalog.label(for: cardId)), \(visibleCards[cardId] == true ? "visible" : "oculta")")
            }
            .onMove { indices, newOffset in
                cardOrder.move(fromOffsets: indices, toOffset: newOffset)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(BBNColors.background)
        .environment(\.editMode, .constant(.active))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Lista de tarjetas reordenable")
    }

    private func toggleBinding(for cardId: String) -> Binding<Bool> {
        Binding(
            get: { visibleCards[cardId] ?? false },
            set: { visibleCards[cardId] = $0 }
        )
    }
}
