import SwiftUI
import UniformTypeIdentifiers

struct TemplateWizardView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var auth: AuthViewModel
    @EnvironmentObject var toast: ToastManager
    @Environment(\.dismiss) private var dismiss

    /// When non-nil the wizard is in **edit** mode: fields are pre-populated
    /// from this preset and save calls `updatePresetFull` instead of `createPreset`.
    var editingPreset: DriverConfigPreset? = nil

    @State private var step = 1
    @State private var presetName = ""
    @State private var visibleCards: [String: Bool] = [:]
    @State private var cardOrder: [String] = []
    @State private var contrast: Double = 0.0
    @State private var orientation: OrientationLock = .free
    @State private var audioEnabled = false
    @State private var isSaving = false
    @State private var draggingCard: DriverCard?

    private var isEditMode: Bool { editingPreset != nil }
    private let totalSteps = 4

    private var canBox: Bool {
        if auth.user?.isAdmin == true { return true }
        return auth.user?.tabAccess?.contains("app-config-box") == true
    }

    private var visibleGroups: [DriverCardGroup] {
        DriverCardGroup.allCases.filter { $0 != .box || canBox }
    }

    private func cards(in group: DriverCardGroup) -> [DriverCard] {
        // Plan-aware filter (same as CardVisibilityView). Empty / nil
        // `allowedCards` => fall back to the full catalog so we don't
        // strip the wizard down to nothing for users without a plan
        // match (admins, trial, older clients).
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

    /// Cards that are toggled visible, in their current order
    private var orderedVisibleCards: [DriverCard] {
        cardOrder.compactMap { key in
            guard visibleCards[key] == true else { return nil }
            return DriverCard(rawValue: key)
        }.filter { canBox || $0.group != .box }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                stepIndicator
                Divider().background(Color(.systemGray4))

                Group {
                    switch step {
                    case 1: stepName
                    case 2: stepVisibility
                    case 3: stepOrder
                    case 4: stepDisplayOptions
                    default: EmptyView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                Divider().background(Color(.systemGray4))
                navigationButtons
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle(isEditMode ? "Editar plantilla" : "Nueva plantilla")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .foregroundColor(.gray)
                }
            }
            .onAppear {
                if let preset = editingPreset {
                    // Edit mode: populate from the existing preset
                    presetName = preset.name
                    visibleCards = preset.visibleCards
                    cardOrder = preset.cardOrder
                    contrast = preset.contrast ?? 0.0
                    orientation = OrientationLock(rawValue: preset.orientation ?? "free") ?? .free
                    audioEnabled = preset.audioEnabled ?? false
                } else {
                    // Create mode: initialize from current DriverViewModel config
                    visibleCards = driverVM.visibleCards
                    cardOrder = driverVM.cardOrder
                    contrast = driverVM.brightness
                    orientation = driverVM.orientationLock
                }
                // Stale presets (saved before newer DriverCard cases
                // existed) don't carry the new keys in cardOrder. The
                // step-3 preview iterates cardOrder, so without this
                // migration any card added after the preset's snapshot
                // would silently never show in the wizard's reorder
                // grid even when the user toggles it on in step 2.
                let allIds = DriverCard.allCases.map { $0.rawValue }
                let missing = allIds.filter { !cardOrder.contains($0) }
                if !missing.isEmpty {
                    cardOrder.append(contentsOf: missing)
                    for id in missing where visibleCards[id] == nil {
                        if let card = DriverCard(rawValue: id) {
                            visibleCards[id] = !card.requiresGPS
                        }
                    }
                }
            }
        }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        HStack(spacing: 8) {
            ForEach(1...totalSteps, id: \.self) { s in
                HStack(spacing: 4) {
                    Circle()
                        .fill(s <= step ? Color.accentColor : Color(.systemGray4))
                        .frame(width: 8, height: 8)
                    if s == step {
                        Text(stepLabel(s))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.accentColor)
                    }
                }
            }
            Spacer()
            Text("\(step)/\(totalSteps)")
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundColor(.gray)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func stepLabel(_ s: Int) -> String {
        switch s {
        case 1: return "Nombre"
        case 2: return "Tarjetas"
        case 3: return "Orden"
        case 4: return "Opciones"
        default: return ""
        }
    }

    // MARK: - Step 1: Name

    private var stepName: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: isEditMode ? "pencil.circle" : "doc.badge.plus")
                .font(.system(size: 48))
                .foregroundColor(.accentColor)

            Text("Nombre de la plantilla")
                .font(.title3.bold())
                .foregroundColor(.white)

            Text(isEditMode
                 ? "Modifica el nombre de la plantilla si lo deseas"
                 : "Elige un nombre para identificar esta configuración")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)

            TextField("Ej: Carrera nocturna", text: $presetName)
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal, 40)

            Spacer()
        }
        .padding()
    }

    // MARK: - Step 2: Card Visibility

    private var stepVisibility: some View {
        List {
            ForEach(visibleGroups, id: \.self) { group in
                let groupCards = cards(in: group)
                if !groupCards.isEmpty {
                    Section(sectionTitle(group)) {
                        ForEach(groupCards) { card in
                            Toggle(isOn: visibilityBinding(for: card)) {
                                HStack {
                                    Image(systemName: card.iconName)
                                        .foregroundColor(card.accentColor)
                                        .frame(width: 24)
                                    Text(card.displayName)
                                        .foregroundColor(.white)
                                }
                            }
                            .tint(.accentColor)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func visibilityBinding(for card: DriverCard) -> Binding<Bool> {
        Binding(
            get: { visibleCards[card.rawValue] ?? true },
            set: { visibleCards[card.rawValue] = $0 }
        )
    }

    // MARK: - Step 3: Card Order (drag-and-drop grid)

    private var stepOrder: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let numCols = isLandscape ? 3 : 2
            let cards = orderedVisibleCards
            let numRows = (cards.count + numCols - 1) / numCols
            let spacing: CGFloat = 8
            let padding: CGFloat = 12

            let totalVerticalSpacing = spacing * CGFloat(max(0, numRows - 1))
            let availableHeight = geo.size.height - padding * 2 - totalVerticalSpacing
            let cardHeight = numRows > 0 ? max(60, availableHeight / CGFloat(numRows)) : 80
            let scale = min(2.0, max(0.8, cardHeight / 80))
            let columns = Array(repeating: GridItem(.flexible(), spacing: spacing), count: numCols)

            Group {
                if numRows > 0 && availableHeight / CGFloat(numRows) >= 60 {
                    LazyVGrid(columns: columns, spacing: spacing) {
                        ForEach(cards) { card in
                            CardPreviewCell(card: card, isDragging: draggingCard == card, height: cardHeight, scale: scale)
                                .onDrag {
                                    draggingCard = card
                                    return NSItemProvider(object: card.rawValue as NSString)
                                }
                                .onDrop(of: [.text], delegate: WizardCardDropDelegate(
                                    card: card,
                                    draggingCard: $draggingCard,
                                    visibleCards: visibleCards,
                                    cardOrder: $cardOrder,
                                    canShowBoxCards: canBox
                                ))
                        }
                    }
                    .padding(padding)
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: spacing) {
                            ForEach(cards) { card in
                                CardPreviewCell(card: card, isDragging: draggingCard == card, height: 80, scale: 1.0)
                                    .onDrag {
                                        draggingCard = card
                                        return NSItemProvider(object: card.rawValue as NSString)
                                    }
                                    .onDrop(of: [.text], delegate: WizardCardDropDelegate(
                                        card: card,
                                        draggingCard: $draggingCard,
                                        visibleCards: visibleCards,
                                        cardOrder: $cardOrder,
                                        canShowBoxCards: canBox
                                    ))
                            }
                        }
                        .padding(padding)
                    }
                }
            }
        }
        .background(Color.black)
    }

    // MARK: - Step 4: Display Options

    private var stepDisplayOptions: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                // Contrast
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Contraste")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        Spacer()
                        Text(contrast == 0 ? "Normal" : "+\(Int(contrast * 100))%")
                            .font(.caption.monospacedDigit())
                            .foregroundColor(.gray)
                    }
                    Slider(value: $contrast, in: 0...1.0, step: 0.05)
                        .accentColor(.accentColor)
                }

                // Orientation
                VStack(alignment: .leading, spacing: 8) {
                    Text("Orientacion")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    Picker("", selection: $orientation) {
                        ForEach(OrientationLock.allCases, id: \.self) { o in
                            Text(o.displayName).tag(o)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // Audio
                Toggle(isOn: $audioEnabled) {
                    HStack(spacing: 8) {
                        Image(systemName: audioEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                            .foregroundColor(audioEnabled ? .accentColor : .gray)
                        Text("Audio")
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                }
                .tint(.accentColor)

                // Summary
                VStack(alignment: .leading, spacing: 6) {
                    Text("Resumen")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    let visCount = visibleCards.filter { $0.value }.count
                    Text("\(visCount) tarjetas visibles")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("Contraste: \(contrast == 0 ? "Normal" : "+\(Int(contrast * 100))%")")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("Orientacion: \(orientation.displayName)")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text("Audio: \(audioEnabled ? "Si" : "No")")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.systemGray6).opacity(0.5))
                .cornerRadius(12)
            }
            .padding(20)
        }
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: 12) {
            if step > 1 {
                Button(action: { withAnimation { step -= 1 } }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Anterior")
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Color(.systemGray5))
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
            }

            if step < totalSteps {
                Button(action: { withAnimation { step += 1 } }) {
                    HStack(spacing: 4) {
                        Text("Siguiente")
                        Image(systemName: "chevron.right")
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(canAdvance ? Color.accentColor : Color(.systemGray4))
                    .foregroundColor(canAdvance ? .black : .gray)
                    .cornerRadius(12)
                }
                .disabled(!canAdvance)
            } else {
                Button(action: { saveTemplate() }) {
                    HStack(spacing: 6) {
                        if isSaving {
                            ProgressView()
                                .tint(.black)
                        }
                        Text(isEditMode ? "Actualizar plantilla" : "Guardar plantilla")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(presetName.isEmpty ? Color(.systemGray4) : Color.accentColor)
                    .foregroundColor(presetName.isEmpty ? .gray : .black)
                    .cornerRadius(12)
                }
                .disabled(isSaving || presetName.isEmpty)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var canAdvance: Bool {
        switch step {
        case 1: return !presetName.trimmingCharacters(in: .whitespaces).isEmpty
        default: return true
        }
    }

    // MARK: - Save

    private func saveTemplate() {
        guard !presetName.isEmpty else { return }
        isSaving = true
        Task {
            do {
                if let preset = editingPreset {
                    // Edit mode: update existing preset
                    try await driverVM.updatePresetFull(
                        id: preset.id,
                        name: presetName,
                        visibleCards: visibleCards,
                        cardOrder: cardOrder,
                        contrast: contrast,
                        orientation: orientation.rawValue,
                        audioEnabled: audioEnabled
                    )
                    await MainActor.run {
                        toast.success("Plantilla \"\(presetName)\" actualizada")
                        isSaving = false
                        dismiss()
                    }
                } else {
                    // Create mode: new preset
                    try await driverVM.saveAsPreset(
                        name: presetName,
                        visibleCards: visibleCards,
                        cardOrder: cardOrder,
                        contrast: contrast,
                        orientation: orientation.rawValue,
                        audioEnabled: audioEnabled
                    )
                    await MainActor.run {
                        toast.success("Plantilla \"\(presetName)\" guardada")
                        isSaving = false
                        dismiss()
                    }
                }
            } catch {
                await MainActor.run {
                    toast.error("Error al guardar: \(error.localizedDescription)")
                    isSaving = false
                }
            }
        }
    }
}

// MARK: - Wizard Drop Delegate (works with local @State binding instead of DriverViewModel)

struct WizardCardDropDelegate: DropDelegate {
    let card: DriverCard
    @Binding var draggingCard: DriverCard?
    let visibleCards: [String: Bool]
    @Binding var cardOrder: [String]
    let canShowBoxCards: Bool

    func performDrop(info: DropInfo) -> Bool {
        draggingCard = nil
        return true
    }

    func dropEntered(info: DropInfo) {
        guard let dragging = draggingCard, dragging != card else { return }
        let visible = cardOrder.compactMap { key -> DriverCard? in
            guard visibleCards[key] == true else { return nil }
            return DriverCard(rawValue: key)
        }.filter { canShowBoxCards || $0.group != .box }

        guard let fromIdx = visible.firstIndex(of: dragging),
              let toIdx = visible.firstIndex(of: card) else { return }

        var newOrder = visible.map { $0.rawValue }
        newOrder.move(fromOffsets: IndexSet(integer: fromIdx), toOffset: toIdx > fromIdx ? toIdx + 1 : toIdx)

        let hiddenCards = cardOrder.filter { key in
            visibleCards[key] != true
        }
        withAnimation(.easeInOut(duration: 0.15)) {
            cardOrder = newOrder + hiddenCards
        }
    }
}
