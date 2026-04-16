import SwiftUI

/// Sheet form for creating or editing a `DriverConfigPreset`. Shows the name
/// field, a default-toggle, per-group card toggles to control visibility, and
/// a chevron-based reorder list for `cardOrder`. Mirrors the canonical 21-card
/// catalog from `DriverCardCatalog` so presets round-trip cleanly between the
/// iPad and web editors.
struct PresetFormView: View {
    let initial: DriverConfigPreset?
    let onSubmit: (DriverConfigPreset) async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var visibleCards: [String: Bool] = [:]
    @State private var cardOrder: [String] = []
    @State private var isDefault: Bool = false
    @State private var saving: Bool = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    dataCard
                    togglesCard
                    orderCard
                }
                .padding(20)
            }
            .scrollContentBackground(.hidden)
            .background(BBNColors.background)
            .navigationTitle(initial == nil ? "Nuevo preset" : "Editar preset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        Task { await save() }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Formulario de preset")
        }
        .task { seedState() }
    }

    // MARK: - Data card

    private var dataCard: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Datos")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                TextField("Nombre del preset", text: $name)
                    .textFieldStyle(.roundedBorder)
                    .font(BBNTypography.body)
                Toggle("Marcar como predeterminado", isOn: $isDefault)
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                    .tint(BBNColors.accent)
            }
        }
    }

    // MARK: - Card toggles

    private var togglesCard: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("Tarjetas disponibles")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)

                ForEach(DriverCardCatalog.grouped, id: \.0) { group, cards in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(group.title)
                            .font(BBNTypography.bodyBold)
                            .foregroundStyle(BBNColors.textPrimary)
                        VStack(spacing: 4) {
                            ForEach(cards) { card in
                                Toggle(isOn: visibleBinding(card.id)) {
                                    Text(card.label)
                                        .font(BBNTypography.body)
                                        .foregroundStyle(BBNColors.textPrimary)
                                }
                                .tint(BBNColors.accent)
                                .accessibilityLabel(card.label)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Reorder card

    private var orderCard: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Orden")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)

                if cardOrder.isEmpty {
                    Text("Activa al menos una tarjeta para ordenarlas.")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                } else {
                    VStack(spacing: 4) {
                        ForEach(Array(cardOrder.enumerated()), id: \.element) { index, id in
                            HStack(spacing: 10) {
                                Text(DriverCardCatalog.label(for: id))
                                    .font(BBNTypography.body)
                                    .foregroundStyle(BBNColors.textPrimary)
                                Spacer()
                                Button {
                                    moveUp(id)
                                } label: {
                                    Image(systemName: "chevron.up")
                                        .font(BBNTypography.body)
                                        .foregroundStyle(BBNColors.accent)
                                }
                                .disabled(index == 0)
                                .accessibilityLabel("Subir \(DriverCardCatalog.label(for: id))")

                                Button {
                                    moveDown(id)
                                } label: {
                                    Image(systemName: "chevron.down")
                                        .font(BBNTypography.body)
                                        .foregroundStyle(BBNColors.accent)
                                }
                                .disabled(index == cardOrder.count - 1)
                                .accessibilityLabel("Bajar \(DriverCardCatalog.label(for: id))")
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Binding helpers

    private func visibleBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { visibleCards[id] ?? false },
            set: { newValue in
                visibleCards[id] = newValue
                if newValue {
                    if !cardOrder.contains(id) { cardOrder.append(id) }
                } else {
                    cardOrder.removeAll { $0 == id }
                }
            }
        )
    }

    // MARK: - Reorder helpers

    private func moveUp(_ id: String) {
        guard let index = cardOrder.firstIndex(of: id), index > 0 else { return }
        cardOrder.swapAt(index, index - 1)
    }

    private func moveDown(_ id: String) {
        guard let index = cardOrder.firstIndex(of: id), index < cardOrder.count - 1 else { return }
        cardOrder.swapAt(index, index + 1)
    }

    // MARK: - State initialization

    private func seedState() {
        if let initial {
            name = initial.name
            visibleCards = initial.visibleCards
            cardOrder = initial.cardOrder
            isDefault = initial.isDefault
        } else {
            name = ""
            visibleCards = Dictionary(uniqueKeysWithValues: DriverCardCatalog.allIds.map { ($0, true) })
            cardOrder = DriverCardCatalog.allIds
            isDefault = false
        }
    }

    // MARK: - Save

    private func save() async {
        saving = true
        defer { saving = false }
        let draft = DriverConfigPreset(
            id: initial?.id ?? 0,
            name: name.trimmingCharacters(in: .whitespaces),
            visibleCards: visibleCards,
            cardOrder: cardOrder,
            isDefault: isDefault
        )
        await onSubmit(draft)
    }
}
