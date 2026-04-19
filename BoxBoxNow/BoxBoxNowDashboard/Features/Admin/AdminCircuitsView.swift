import SwiftUI

/// Admin Circuits — matches the web `CircuitsManager`:
///   • List of circuits (name, length, active flag, GPS indicator)
///   • "+ Nuevo" button opens an edit sheet with a blank circuit
///   • Tap a row → edit sheet with all admin fields (ports/URLs/GPS)
///   • Delete with confirmation
struct AdminCircuitsView: View {
    @Environment(AppStore.self) private var app

    private var store: AdminStore? { app.admin }

    @State private var editing: Circuit? = nil
    @State private var confirmDeleteId: Int? = nil

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await store?.refreshCircuits() }
        .sheet(item: $editing) { circuit in
            CircuitEditorSheet(circuit: circuit, isNew: circuit.id == 0)
                .environment(app)
        }
        .alert("Eliminar circuito",
               isPresented: Binding(
                 get: { confirmDeleteId != nil },
                 set: { if !$0 { confirmDeleteId = nil } }
               )) {
            Button("Cancelar", role: .cancel) { confirmDeleteId = nil }
            Button("Eliminar", role: .destructive) {
                if let id = confirmDeleteId {
                    Task { try? await store?.deleteCircuit(id: id) }
                }
                confirmDeleteId = nil
            }
        } message: {
            Text("Esta accion no se puede deshacer.")
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            HStack(spacing: 8) {
                Text("Circuitos")
                    .font(BBNTypography.title2)
                    .foregroundColor(BBNColors.textPrimary)
                if let count = store?.circuits.count, count > 0 {
                    Text("\(count)")
                        .font(BBNTypography.caption)
                        .foregroundColor(.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(BBNColors.accent)
                        .clipShape(Capsule())
                }
            }
            Spacer()
            Button {
                editing = Circuit(id: 0, name: "", lengthM: nil, isActive: false)
            } label: {
                Label("Nuevo", systemImage: "plus")
                    .font(BBNTypography.body)
                    .foregroundColor(BBNColors.accent)
            }
            Button {
                Task { await store?.refreshCircuits() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .foregroundColor(BBNColors.textMuted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if store?.isLoading == true && (store?.circuits.isEmpty ?? true) {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store?.circuits.isEmpty ?? true {
            BBNEmptyState(
                icon: "flag.checkered",
                title: "Sin circuitos",
                subtitle: "No hay circuitos configurados"
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(store?.circuits ?? []) { circuit in
                        circuitRow(circuit)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    private func circuitRow(_ circuit: Circuit) -> some View {
        BBNCard {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(BBNColors.surface)
                        .frame(width: 44, height: 44)
                    Image(systemName: "flag.checkered")
                        .foregroundColor(BBNColors.accent)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(circuit.name)
                        .font(BBNTypography.bodyBold)
                        .foregroundColor(BBNColors.textPrimary)

                    HStack(spacing: 12) {
                        if let length = circuit.lengthM {
                            Label("\(length) m", systemImage: "ruler")
                                .font(BBNTypography.caption)
                                .foregroundColor(BBNColors.textDim)
                        }
                        if circuit.isActive == true {
                            HStack(spacing: 4) {
                                Circle().fill(BBNColors.success).frame(width: 6, height: 6)
                                Text("Activo")
                                    .font(BBNTypography.caption)
                                    .foregroundColor(BBNColors.success)
                            }
                        }
                        if circuit.finishLat1 != nil {
                            Label("GPS", systemImage: "location.fill")
                                .font(BBNTypography.caption)
                                .foregroundColor(BBNColors.textDim)
                        }
                    }
                }

                Spacer()

                Button { editing = circuit } label: {
                    Image(systemName: "pencil")
                        .foregroundColor(BBNColors.textMuted)
                        .padding(8)
                }.buttonStyle(.plain)
                Button { confirmDeleteId = circuit.id } label: {
                    Image(systemName: "trash")
                        .foregroundColor(BBNColors.danger.opacity(0.8))
                        .padding(8)
                }.buttonStyle(.plain)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { editing = circuit }
    }
}

// MARK: - Editor sheet

private struct CircuitEditorSheet: View {
    @Environment(AppStore.self) private var app
    @Environment(\.dismiss) private var dismiss

    let original: Circuit
    let isNew: Bool

    @State private var name: String
    @State private var lengthM: String
    @State private var pitTimeS: String
    @State private var wsPort: String
    @State private var wsPortData: String
    @State private var phpApiPort: String
    @State private var lapsDiscard: String
    @State private var lapDifferential: String
    @State private var phpApiUrl: String
    @State private var liveTimingUrl: String
    @State private var retentionDays: String
    @State private var finishLat1: String
    @State private var finishLon1: String
    @State private var finishLat2: String
    @State private var finishLon2: String
    @State private var isActive: Bool
    @State private var saving: Bool = false

    init(circuit: Circuit, isNew: Bool) {
        self.original = circuit
        self.isNew = isNew
        // Inline closures instead of `.map(String.init)` — `String` has many
        // initializers and passing `String.init` as a function reference
        // triggers "Ambiguous use of 'init'" in Xcode 15+.
        _name = State(initialValue: circuit.name)
        _lengthM = State(initialValue: circuit.lengthM.map { "\($0)" } ?? "")
        _pitTimeS = State(initialValue: circuit.pitTimeS.map { "\($0)" } ?? "")
        _wsPort = State(initialValue: circuit.wsPort.map { "\($0)" } ?? "")
        _wsPortData = State(initialValue: circuit.wsPortData.map { "\($0)" } ?? "")
        _phpApiPort = State(initialValue: circuit.phpApiPort.map { "\($0)" } ?? "")
        _lapsDiscard = State(initialValue: circuit.lapsDiscard.map { "\($0)" } ?? "")
        _lapDifferential = State(initialValue: circuit.lapDifferential.map { "\($0)" } ?? "")
        _phpApiUrl = State(initialValue: circuit.phpApiUrl ?? "")
        _liveTimingUrl = State(initialValue: circuit.liveTimingUrl ?? "")
        _retentionDays = State(initialValue: circuit.retentionDays.map { "\($0)" } ?? "")
        _finishLat1 = State(initialValue: circuit.finishLat1.map { "\($0)" } ?? "")
        _finishLon1 = State(initialValue: circuit.finishLon1.map { "\($0)" } ?? "")
        _finishLat2 = State(initialValue: circuit.finishLat2.map { "\($0)" } ?? "")
        _finishLon2 = State(initialValue: circuit.finishLon2.map { "\($0)" } ?? "")
        _isActive = State(initialValue: circuit.isActive ?? false)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    section("General") {
                        textRow(label: "Nombre", value: $name)
                        textRow(label: "Longitud (m)", value: $lengthM, keyboard: .numberPad)
                        Toggle(isOn: $isActive) {
                            Text("Activo").font(BBNTypography.body).foregroundStyle(BBNColors.textPrimary)
                        }
                        .tint(BBNColors.accent)
                    }

                    section("Parámetros de carrera") {
                        textRow(label: "Pit time (s)", value: $pitTimeS, keyboard: .numberPad)
                        textRow(label: "Vueltas descartar", value: $lapsDiscard, keyboard: .numberPad)
                        textRow(label: "Diferencial vuelta (ms)", value: $lapDifferential, keyboard: .numberPad)
                        textRow(label: "Retention days", value: $retentionDays, keyboard: .numberPad)
                    }

                    section("Apex Timing") {
                        textRow(label: "WS port", value: $wsPort, keyboard: .numberPad)
                        textRow(label: "WS port data", value: $wsPortData, keyboard: .numberPad)
                        textRow(label: "PHP API port", value: $phpApiPort, keyboard: .numberPad)
                        textRow(label: "PHP API url", value: $phpApiUrl)
                        textRow(label: "Live timing url", value: $liveTimingUrl)
                    }

                    section("Linea de meta GPS") {
                        Text("Los dos puntos definen la recta de meta. Introduce coordenadas decimales (WGS84).")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                        HStack(spacing: 10) {
                            textRow(label: "Lat 1", value: $finishLat1, keyboard: .decimalPad)
                            textRow(label: "Lon 1", value: $finishLon1, keyboard: .decimalPad)
                        }
                        HStack(spacing: 10) {
                            textRow(label: "Lat 2", value: $finishLat2, keyboard: .decimalPad)
                            textRow(label: "Lon 2", value: $finishLon2, keyboard: .decimalPad)
                        }
                    }
                }
                .padding(20)
            }
            .navigationTitle(isNew ? "Nuevo circuito" : original.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "…" : "Guardar") { Task { await save() } }
                        .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                        .foregroundStyle(BBNColors.accent)
                }
            }
        }
        .frame(minWidth: 560, minHeight: 600)
        .background(BBNColors.background)
    }

    @ViewBuilder
    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textMuted)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func textRow(label: String, value: Binding<String>, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            TextField(label, text: value)
                .textFieldStyle(.roundedBorder)
                .font(BBNTypography.body)
                .keyboardType(keyboard)
                .autocorrectionDisabled()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let draft = Circuit(
            id: original.id,
            name: name.trimmingCharacters(in: .whitespaces),
            lengthM: Int(lengthM),
            finishLat1: Double(finishLat1),
            finishLon1: Double(finishLon1),
            finishLat2: Double(finishLat2),
            finishLon2: Double(finishLon2),
            isActive: isActive,
            pitTimeS: Int(pitTimeS),
            wsPort: Int(wsPort),
            wsPortData: Int(wsPortData),
            phpApiPort: Int(phpApiPort),
            lapsDiscard: Int(lapsDiscard),
            lapDifferential: Int(lapDifferential),
            phpApiUrl: phpApiUrl.isEmpty ? nil : phpApiUrl,
            liveTimingUrl: liveTimingUrl.isEmpty ? nil : liveTimingUrl,
            retentionDays: Int(retentionDays)
        )
        if await app.admin?.saveCircuit(draft, isNew: isNew) != nil {
            dismiss()
        }
    }
}
