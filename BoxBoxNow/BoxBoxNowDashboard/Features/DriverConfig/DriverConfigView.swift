import SwiftUI

/// Preset editor for the driver-view card layout. Three-section layout:
///
///  ┌──────────────────────────────────────────────┐
///  │  [Preset picker dropdown]  [Save] [Delete]   │  ← header
///  ├──────────┬───────────────────────────────────┤
///  │ Card list│       Preview grid                 │  ← editor
///  │ (drag +  │       (DriverGridView with mock)   │
///  │  toggle) │                                    │
///  └──────────┴───────────────────────────────────┘
///
/// The view uses `@State` working copies of the selected preset's fields
/// (same pattern as `SessionsView.swift`), then rebuilds the struct on save
/// because `DriverConfigPreset` fields are `let`.
struct DriverConfigView: View {
    @Environment(AppStore.self) private var app

    // Which preset is loaded into the editor.
    @State private var selectedPresetId: Int? = nil

    // Working copies of the selected preset's fields.
    @State private var editName: String = ""
    @State private var editVisibleCards: [String: Bool] = [:]
    @State private var editCardOrder: [String] = []
    @State private var editIsDefault: Bool = false
    @State private var saving: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(BBNColors.border)
            if selectedPresetId != nil {
                editorPane
            } else {
                PlaceholderView(text: "Selecciona o crea un preset para editar la vista de piloto.")
            }
        }
        .background(BBNColors.background)
        .task { await loadFromServer() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Editor de configuración de piloto")
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Text("Config piloto")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
            presetPicker
            if selectedPresetId != nil {
                saveButton
                if selectedPresetId != 0 {
                    deleteButton
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    // MARK: - Preset picker

    private var presetPicker: some View {
        Menu {
            ForEach(app.config.presets) { preset in
                Button(preset.name) {
                    selectedPresetId = preset.id
                    apply(preset)
                }
            }
            if !app.config.presets.isEmpty { Divider() }
            Button("Nuevo preset") {
                selectedPresetId = 0
                editName = "Preset \(app.config.presets.count + 1)"
                editVisibleCards = Dictionary(uniqueKeysWithValues: DriverCardCatalog.allIds.map { ($0, true) })
                editCardOrder = DriverCardCatalog.allIds
                editIsDefault = false
            }
        } label: {
            HStack(spacing: 8) {
                Text(currentPresetLabel)
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                Image(systemName: "chevron.down")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(BBNColors.surface)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(BBNColors.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .accessibilityLabel("Seleccionar preset")
    }

    private var currentPresetLabel: String {
        guard let id = selectedPresetId else { return "Selecciona preset" }
        if id == 0 { return editName.isEmpty ? "Nuevo preset" : editName }
        return app.config.presets.first { $0.id == id }?.name ?? "Preset"
    }

    // MARK: - Save / Delete buttons

    private var saveButton: some View {
        Button {
            Task { await save() }
        } label: {
            Label("Guardar", systemImage: "checkmark.circle.fill")
                .font(BBNTypography.body)
                .foregroundStyle(BBNColors.accent)
        }
        .disabled(saving || editName.trimmingCharacters(in: .whitespaces).isEmpty)
        .accessibilityHint("Guarda el preset actual")
    }

    private var deleteButton: some View {
        Button(role: .destructive) {
            Task { await deleteSelected() }
        } label: {
            Image(systemName: "trash")
                .font(BBNTypography.body)
                .foregroundStyle(BBNColors.danger)
        }
        .accessibilityLabel("Eliminar preset")
    }

    // MARK: - Editor pane (horizontal split)

    private var editorPane: some View {
        HStack(spacing: 0) {
            // Left: name + card list
            VStack(alignment: .leading, spacing: 12) {
                BBNCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nombre")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                        TextField("Nombre del preset", text: $editName)
                            .textFieldStyle(.roundedBorder)
                            .font(BBNTypography.body)
                        Toggle("Marcar como predeterminado", isOn: $editIsDefault)
                            .font(BBNTypography.body)
                            .foregroundStyle(BBNColors.textPrimary)
                            .tint(BBNColors.accent)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)

                Text("Tarjetas")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                    .padding(.horizontal, 16)

                OrderableCardList(
                    cardOrder: $editCardOrder,
                    visibleCards: $editVisibleCards
                )
            }
            .frame(width: 340)

            Divider().overlay(BBNColors.border)

            // Right: live preview
            VStack(alignment: .leading, spacing: 8) {
                Text("Vista previa")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                PreviewGridView(
                    cardOrder: editCardOrder,
                    visibleCards: editVisibleCards
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - IO

    private func loadFromServer() async {
        if app.config.presets.isEmpty {
            await app.config.reloadPresets()
        }
        // Auto-select the first preset if none selected
        if selectedPresetId == nil, let first = app.config.presets.first {
            selectedPresetId = first.id
            apply(first)
        }
    }

    private func apply(_ preset: DriverConfigPreset) {
        editName = preset.name
        editVisibleCards = preset.visibleCards
        editCardOrder = preset.cardOrder
        editIsDefault = preset.isDefault
    }

    private func save() async {
        guard !editName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        saving = true
        defer { saving = false }
        let draft = DriverConfigPreset(
            id: selectedPresetId ?? 0,
            name: editName.trimmingCharacters(in: .whitespaces),
            visibleCards: editVisibleCards,
            cardOrder: editCardOrder,
            isDefault: editIsDefault
        )
        if let saved = await app.config.savePreset(draft) {
            selectedPresetId = saved.id
            apply(saved)
        }
    }

    private func deleteSelected() async {
        guard let id = selectedPresetId, id != 0 else { return }
        if await app.config.deletePreset(id: id) {
            if let first = app.config.presets.first {
                selectedPresetId = first.id
                apply(first)
            } else {
                selectedPresetId = nil
            }
        }
    }
}
