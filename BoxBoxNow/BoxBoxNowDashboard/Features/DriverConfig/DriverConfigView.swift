import SwiftUI

/// Configuración Vista Piloto — iPad equivalent of the web
/// `DriverConfigTab.tsx`. Four stacked sections:
///
///   1. PLANTILLAS    — list of saved presets with star-toggle default,
///                      tap to apply, delete, and "Guardar como plantilla"
///                      input to create a new one from the current state.
///   2. CIRCUITO GPS  — dropdown of the user's circuits. "Automatico"
///                      selects nil, which falls back to the active session.
///   3. NUMERO DE KART — numeric input. Empty = use active session's kart.
///   4. TARJETAS VISIBLES — grouped checkboxes (Carrera / BOX / GPS) that
///                           mirror the active `visibleCards` dict.
///
/// State of the draft card visibility / circuit / kart is local to the view
/// (matches the web hook's in-memory state). Presets API is shared with the
/// rest of the app through `ConfigStore`.
struct DriverConfigView: View {
    @Environment(AppStore.self) private var app

    // Local working state — mirrors web's `useDriverConfig` hook fields.
    @State private var visibleCards: [String: Bool] = [:]
    @State private var cardOrder: [String] = DriverCardCatalog.allIds
    @State private var selectedCircuitId: Int? = nil
    @State private var selectedKartNumber: Int? = nil

    // Save-as-new UI state
    @State private var showSaveInput: Bool = false
    @State private var newPresetName: String = ""
    @State private var savingPreset: Bool = false
    @State private var presetError: String? = nil

    // UserDefaults keys for iPad-local preferences
    private let kCircuitId = "bbn.driverconfig.circuitId"
    private let kKartNumber = "bbn.driverconfig.kartNumber"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                headerSection
                plantillasSection
                circuitSection
                kartNumberSection
                cardsSection
            }
            .padding(20)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(BBNColors.background)
        .task { await initialLoad() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Configuración vista de piloto")
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Configuracion Vista Piloto")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(BBNColors.textPrimary)
            Text("Personaliza la vista del piloto: circuito GPS, numero de kart y tarjetas visibles.")
                .font(.system(size: 11))
                .foregroundStyle(BBNColors.textDim)
        }
    }

    // MARK: - Plantillas (presets)

    private var plantillasSection: some View {
        SectionCard(accent: BBNColors.accent, title: "PLANTILLAS") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Guarda la configuracion actual como plantilla para reutilizarla mas tarde.")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)

                if app.config.presets.isEmpty && !showSaveInput {
                    Text("No tienes plantillas guardadas.")
                        .font(.system(size: 11, weight: .medium))
                        .italic()
                        .foregroundStyle(BBNColors.textDim)
                } else {
                    VStack(spacing: 6) {
                        ForEach(app.config.presets) { preset in
                            presetRow(preset: preset)
                        }
                    }
                }

                if showSaveInput {
                    saveInputRow
                } else {
                    Button { showSaveInput = true } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                            Text("Guardar como plantilla")
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(BBNColors.textMuted)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                                .foregroundStyle(BBNColors.border)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(app.config.presets.count >= 10)
                }

                if let err = presetError {
                    Text(err)
                        .font(.system(size: 11))
                        .foregroundStyle(BBNColors.danger)
                }
            }
        }
    }

    private func presetRow(preset: DriverConfigPreset) -> some View {
        HStack(spacing: 10) {
            Button { Task { await toggleDefault(preset) } } label: {
                Image(systemName: preset.isDefault ? "star.fill" : "star")
                    .font(.system(size: 14))
                    .foregroundStyle(preset.isDefault ? BBNColors.accent : BBNColors.textDim)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(preset.isDefault ? "Desmarcar predefinida" : "Marcar como predefinida")

            Button { applyPreset(preset) } label: {
                HStack(spacing: 6) {
                    Text(preset.name)
                        .font(.system(size: 13))
                        .foregroundStyle(BBNColors.textPrimary)
                    if preset.isDefault {
                        Text("PREDEFINIDA")
                            .font(.system(size: 9, weight: .semibold))
                            .tracking(0.5)
                            .foregroundStyle(BBNColors.accent)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            Text("\(preset.visibleCards.filter { $0.value }.count) tarjetas")
                .font(.system(size: 10))
                .foregroundStyle(BBNColors.textDim)

            Button { Task { await delete(preset) } } label: {
                Image(systemName: "trash")
                    .font(.system(size: 12))
                    .foregroundStyle(BBNColors.textDim)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Eliminar plantilla \(preset.name)")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(BBNColors.background.opacity(0.6))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(preset.isDefault ? BBNColors.accent.opacity(0.6) : BBNColors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var saveInputRow: some View {
        HStack(spacing: 6) {
            TextField("Nombre de la plantilla", text: $newPresetName)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 13))
                .onSubmit { Task { await savePreset() } }
            Button { Task { await savePreset() } } label: {
                Text(savingPreset ? "…" : "Guardar")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(newPresetName.trimmingCharacters(in: .whitespaces).isEmpty ? BBNColors.accent.opacity(0.4) : BBNColors.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .disabled(savingPreset || newPresetName.trimmingCharacters(in: .whitespaces).isEmpty)
            Button {
                showSaveInput = false
                newPresetName = ""
                presetError = nil
            } label: {
                Text("Cancelar")
                    .font(.system(size: 12))
                    .foregroundStyle(BBNColors.textDim)
                    .padding(.horizontal, 6)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Circuit

    private var circuitSection: some View {
        SectionCard(accent: BBNColors.accent, title: "CIRCUITO GPS") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Selecciona el circuito para la linea de meta GPS. Si lo dejas en automatico, usara la sesion activa.")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)

                Menu {
                    Button("Automatico (sesion activa)") {
                        selectedCircuitId = nil
                        persistCircuit()
                    }
                    Divider()
                    ForEach(app.config.circuits) { circuit in
                        Button(circuit.name) {
                            selectedCircuitId = circuit.id
                            persistCircuit()
                        }
                    }
                } label: {
                    HStack {
                        Text(currentCircuitLabel)
                            .font(.system(size: 13))
                            .foregroundStyle(BBNColors.textPrimary)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(BBNColors.textDim)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(BBNColors.background)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(BBNColors.border, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    private var currentCircuitLabel: String {
        if let id = selectedCircuitId, let c = app.config.circuits.first(where: { $0.id == id }) {
            return c.name
        }
        return "Automatico (sesion activa)"
    }

    // MARK: - Kart number

    private var kartNumberSection: some View {
        SectionCard(accent: BBNColors.accent, title: "NUMERO DE KART") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Sobrescribe el numero de kart. Si lo dejas vacio, usara el de la sesion activa.")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)

                TextField(
                    "Automatico (sesion activa)",
                    text: Binding(
                        get: { selectedKartNumber.map(String.init) ?? "" },
                        set: { newValue in
                            let trimmed = newValue.trimmingCharacters(in: .whitespaces)
                            selectedKartNumber = trimmed.isEmpty ? nil : Int(trimmed)
                            persistKart()
                        }
                    )
                )
                .keyboardType(.numberPad)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 13))
            }
        }
    }

    // MARK: - Card visibility

    private var cardsSection: some View {
        SectionCard(accent: BBNColors.accent, title: "TARJETAS VISIBLES") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Selecciona las tarjetas que quieres ver en la vista del piloto.")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)

                ForEach(DriverCardCatalog.Group.allCases) { group in
                    let cards = DriverCardCatalog.all.filter { $0.group == group }
                        .sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
                    if !cards.isEmpty {
                        groupBlock(group: group, cards: cards)
                    }
                }
            }
        }
    }

    private func groupBlock(group: DriverCardCatalog.Group, cards: [DriverCardCatalog.Card]) -> some View {
        let isGps = group == .gps
        let groupColor: Color = isGps ? Color(red: 0.24, green: 0.77, blue: 0.98) : BBNColors.accent
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if isGps {
                    Image(systemName: "location.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(groupColor)
                }
                Text(group.title.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1)
                    .foregroundStyle(groupColor)
                if isGps {
                    Text("(requieren RaceBox o GPS del movil)")
                        .font(.system(size: 9))
                        .foregroundStyle(groupColor.opacity(0.6))
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 2), spacing: 6) {
                ForEach(cards) { card in
                    cardCheckbox(card: card, groupColor: groupColor)
                }
            }
        }
    }

    private func cardCheckbox(card: DriverCardCatalog.Card, groupColor: Color) -> some View {
        let checked = visibleCards[card.id] ?? true
        return Button {
            visibleCards[card.id] = !checked
        } label: {
            HStack(spacing: 8) {
                Image(systemName: checked ? "checkmark.square.fill" : "square")
                    .font(.system(size: 14))
                    .foregroundStyle(checked ? groupColor : BBNColors.textDim)
                Text(card.label)
                    .font(.system(size: 12))
                    .foregroundStyle(checked ? BBNColors.textPrimary : BBNColors.textDim)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(BBNColors.background.opacity(0.6))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(checked ? groupColor.opacity(0.4) : BBNColors.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    // MARK: - IO

    private func initialLoad() async {
        // Hydrate circuit + kart from UserDefaults first (instant UI)
        let d = UserDefaults.standard
        if d.object(forKey: kCircuitId) != nil {
            let id = d.integer(forKey: kCircuitId)
            selectedCircuitId = id > 0 ? id : nil
        }
        if d.object(forKey: kKartNumber) != nil {
            let n = d.integer(forKey: kKartNumber)
            selectedKartNumber = n > 0 ? n : nil
        }
        // Then fetch from server
        if app.config.circuits.isEmpty { await app.config.refresh() }
        if app.config.presets.isEmpty { await app.config.reloadPresets() }
        await app.config.reloadPreferences()
        if let prefs = app.config.preferences {
            visibleCards = prefs.visibleCards.isEmpty
                ? Dictionary(uniqueKeysWithValues: DriverCardCatalog.allIds.map { ($0, true) })
                : prefs.visibleCards
            cardOrder = prefs.cardOrder.isEmpty ? DriverCardCatalog.allIds : prefs.cardOrder
        } else {
            visibleCards = Dictionary(uniqueKeysWithValues: DriverCardCatalog.allIds.map { ($0, true) })
            cardOrder = DriverCardCatalog.allIds
        }
    }

    private func persistCircuit() {
        UserDefaults.standard.set(selectedCircuitId ?? 0, forKey: kCircuitId)
    }

    private func persistKart() {
        UserDefaults.standard.set(selectedKartNumber ?? 0, forKey: kKartNumber)
    }

    private func applyPreset(_ preset: DriverConfigPreset) {
        let allIds = DriverCardCatalog.allIds
        var merged = Dictionary(uniqueKeysWithValues: allIds.map { ($0, true) })
        for (k, v) in preset.visibleCards { merged[k] = v }
        visibleCards = merged
        cardOrder = preset.cardOrder.isEmpty ? allIds : preset.cardOrder
        // Fire-and-forget: save prefs so this preset sticks across sessions
        Task {
            _ = await app.config.savePreferences(
                DriverPreferences(visibleCards: merged, cardOrder: cardOrder)
            )
        }
    }

    private func toggleDefault(_ preset: DriverConfigPreset) async {
        let draft = DriverConfigPreset(
            id: preset.id,
            name: preset.name,
            visibleCards: preset.visibleCards,
            cardOrder: preset.cardOrder,
            isDefault: !preset.isDefault,
            contrast: preset.contrast,
            orientation: preset.orientation,
            audioEnabled: preset.audioEnabled
        )
        _ = await app.config.savePreset(draft)
    }

    private func delete(_ preset: DriverConfigPreset) async {
        _ = await app.config.deletePreset(id: preset.id)
    }

    private func savePreset() async {
        let name = newPresetName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        savingPreset = true
        presetError = nil
        defer { savingPreset = false }

        // Create: id=0 → backend creates. Use the current in-memory state.
        let draft = DriverConfigPreset(
            id: 0, name: name,
            visibleCards: visibleCards,
            cardOrder: cardOrder.isEmpty ? DriverCardCatalog.allIds : cardOrder,
            isDefault: false
        )
        if await app.config.savePreset(draft) != nil {
            newPresetName = ""
            showSaveInput = false
        } else {
            presetError = app.config.lastError ?? "Error al guardar"
        }
    }
}

// MARK: - Section card shell

private struct SectionCard<Content: View>: View {
    let accent: Color
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(1)
                .foregroundStyle(accent)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BBNColors.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(BBNColors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
