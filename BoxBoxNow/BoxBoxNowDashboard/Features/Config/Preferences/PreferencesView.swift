import SwiftUI

/// Read-only summary of the live `DriverPreferences` with an "Apply preset"
/// picker that copies a preset's cards into preferences. The richer
/// drag-reorder editor lives in Task 26's DriverConfig module — this view
/// intentionally stays lightweight.
struct PreferencesView: View {
    @Environment(AppStore.self) private var app

    @State private var selectedPresetId: Int? = nil
    @State private var applying: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    cardApplied
                    cardVisibleList
                    cardApplyPicker
                }
                .padding(20)
            }
        }
        .background(BBNColors.background)
        .task { await loadFromServer() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Editor de preferencias de piloto")
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Preferencias")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    // MARK: - Card 1: Preset aplicado

    private var cardApplied: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Preset aplicado")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)

                if let prefs = app.config.preferences {
                    if let name = currentPresetName() {
                        Text(name)
                            .font(BBNTypography.title3)
                            .foregroundStyle(BBNColors.textPrimary)
                    } else if prefs.cardOrder.isEmpty && prefs.visibleCards.isEmpty {
                        Text("Aún no has configurado tus preferencias.")
                            .font(BBNTypography.body)
                            .foregroundStyle(BBNColors.textMuted)
                    } else {
                        Text("Configuración personalizada")
                            .font(BBNTypography.title3)
                            .foregroundStyle(BBNColors.textPrimary)
                    }
                } else {
                    Text("Aún no has configurado tus preferencias.")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Card 2: Tarjetas visibles

    private var cardVisibleList: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Tarjetas visibles")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)

                let visibleIds = visibleCardIds()
                if visibleIds.isEmpty {
                    Text("No hay tarjetas visibles. Aplica un preset para empezar.")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                } else {
                    ForEach(visibleIds, id: \.self) { id in
                        HStack(spacing: 8) {
                            Image(systemName: "square.fill")
                                .foregroundStyle(BBNColors.accent)
                            Text(DriverCardCatalog.label(for: id))
                                .font(BBNTypography.body)
                                .foregroundStyle(BBNColors.textPrimary)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Card 3: Aplicar preset

    private var cardApplyPicker: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Aplicar preset")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)

                if app.config.presets.isEmpty {
                    Text("Crea primero un preset en la pestaña de presets.")
                        .foregroundStyle(BBNColors.textMuted)
                        .font(BBNTypography.body)
                } else {
                    Picker("Elegir preset", selection: $selectedPresetId) {
                        Text("— Selecciona —").tag(Int?.none)
                        ForEach(app.config.presets) { preset in
                            Text(preset.name).tag(Int?.some(preset.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(BBNColors.accent)

                    BBNPrimaryButton(
                        title: applying ? "Aplicando..." : "Aplicar preset",
                        isLoading: applying
                    ) {
                        Task { await applySelected() }
                    }
                    .disabled(selectedPresetId == nil || applying)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Helpers

    /// Returns the name of the first preset whose `cardOrder` and `visibleCards`
    /// match the current preferences exactly, or `nil` for custom / none.
    private func currentPresetName() -> String? {
        guard let prefs = app.config.preferences else { return nil }
        return app.config.presets.first(where: {
            $0.cardOrder == prefs.cardOrder && $0.visibleCards == prefs.visibleCards
        })?.name
    }

    /// Returns the ids from `preferences.cardOrder` where `visibleCards[id]`
    /// is true. This is the list of cards the driver view will actually show.
    private func visibleCardIds() -> [String] {
        guard let prefs = app.config.preferences else { return [] }
        return prefs.cardOrder.filter { prefs.visibleCards[$0] == true }
    }

    // MARK: - Actions

    private func applySelected() async {
        guard let presetId = selectedPresetId,
              let preset = app.config.presets.first(where: { $0.id == presetId }) else {
            return
        }
        applying = true
        defer { applying = false }
        let draft = DriverPreferences(
            visibleCards: preset.visibleCards,
            cardOrder: preset.cardOrder
        )
        await app.config.savePreferences(draft)
    }

    // MARK: - IO

    private func loadFromServer() async {
        if app.config.presets.isEmpty {
            await app.config.reloadPresets()
        }
        if app.config.preferences == nil {
            await app.config.reloadPreferences()
        }
    }
}
