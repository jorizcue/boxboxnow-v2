import SwiftUI

/// Single-form editor for the user's active `RaceSession`. The backend keeps
/// one active session per user; this view loads it on appear, edits it in
/// place, and saves via POST (if none existed) or PATCH (if one existed).
///
/// There is no list — the web equivalent is `ConfigPanel.tsx > RaceSessionEditor`,
/// which edits the singular active session. Mirrors the field set and flow.
struct SessionsView: View {
    @Environment(AppStore.self) private var app

    // Form state. Initialized from `RaceSession.empty` so the form is usable
    // even before the server's active-session fetch completes; replaced in
    // `loadFromServer` once the real session arrives.
    @State private var name: String = ""
    @State private var circuitId: Int = 0
    @State private var durationMin: Int = 180
    @State private var minStintMin: Int = 15
    @State private var maxStintMin: Int = 40
    @State private var minPits: Int = 3
    @State private var pitTimeS: Int = 120
    @State private var minDriverTimeMin: Int = 30
    @State private var rain: Bool = false
    @State private var pitClosedStartMin: Int = 0
    @State private var pitClosedEndMin: Int = 0
    @State private var boxLines: Int = 2
    @State private var boxKarts: Int = 30
    @State private var ourKartNumber: Int = 0
    @State private var refreshIntervalS: Int = 1
    @State private var saving: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            header
            if app.config.isLoadingSession && app.config.activeSession == nil {
                ProgressView()
                    .tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        circuitCard
                        numericGrid
                        rainCard
                        saveButton
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task { await loadFromServer() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Editor de sesión activa")
    }

    private var header: some View {
        HStack {
            Text("Sesiones")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            if app.config.activeSession != nil {
                Text("ACTIVA")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(BBNColors.accent.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
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

    private var circuitCard: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Circuito")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                if app.config.circuits.isEmpty {
                    Text("Cargando circuitos…")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                } else {
                    Picker("Circuito", selection: $circuitId) {
                        Text("Selecciona un circuito").tag(0)
                        ForEach(app.config.circuits) { circuit in
                            Text(circuit.name).tag(circuit.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(BBNColors.accent)
                }

                TextField("Nombre de la sesión", text: $name)
                    .textFieldStyle(.roundedBorder)
                    .font(BBNTypography.body)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Circuito y nombre de la sesión")
    }

    private var numericGrid: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Parámetros de carrera")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
                    numField("Tu kart", value: $ourKartNumber, range: 0...999, highlight: true)
                    numField("Duración (min)", value: $durationMin, range: 1...600)
                    numField("Mín. pits", value: $minPits, range: 0...50)
                    numField("Pit time (s)", value: $pitTimeS, range: 0...600)
                    numField("Mín. stint (min)", value: $minStintMin, range: 0...120)
                    numField("Máx. stint (min)", value: $maxStintMin, range: 0...240)
                    numField("Mín. piloto (min)", value: $minDriverTimeMin, range: 0...600)
                    numField("Pit cerrado inicio", value: $pitClosedStartMin, range: 0...120)
                    numField("Pit cerrado fin", value: $pitClosedEndMin, range: 0...120)
                    numField("Líneas de box", value: $boxLines, range: 1...10)
                    numField("Karts de box", value: $boxKarts, range: 1...200)
                    numField("Refresh (s)", value: $refreshIntervalS, range: 1...60)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Parámetros numéricos de la sesión")
    }

    @ViewBuilder
    private func numField(_ label: String, value: Binding<Int>, range: ClosedRange<Int>, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Stepper(value: value, in: range) {
                Text("\(value.wrappedValue)")
                    .font(BBNTypography.title3)
                    .monospacedDigit()
                    .foregroundStyle(highlight ? BBNColors.accent : BBNColors.textPrimary)
            }
            .labelsHidden()
        }
        .padding(10)
        .background(BBNColors.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(highlight ? BBNColors.accent.opacity(0.4) : BBNColors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), valor \(value.wrappedValue)")
    }

    private var rainCard: some View {
        BBNCard {
            Toggle(isOn: $rain) {
                Text("Lluvia")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
            }
            .tint(BBNColors.accent)
        }
    }

    private var saveButton: some View {
        BBNPrimaryButton(
            title: app.config.activeSession == nil ? "Crear sesión" : "Guardar cambios",
            isLoading: saving
        ) {
            Task { await save() }
        }
        .disabled(saving || circuitId == 0)
        .accessibilityHint("Guarda la sesión activa")
    }

    // MARK: - IO

    private func loadFromServer() async {
        // Circuits are needed to render the picker regardless of whether a
        // session exists. Re-navigating to the tab after a transient error
        // (e.g. the user hit a 500 on first load) should transparently retry —
        // refresh() is idempotent, and lastError should not gate the retry.
        if app.config.circuits.isEmpty {
            await app.config.refresh()
        }
        await app.config.reloadActiveSession()
        if let s = app.config.activeSession {
            apply(s)
        }
    }

    private func apply(_ s: RaceSession) {
        name = s.name ?? ""
        circuitId = s.circuitId ?? 0
        durationMin = s.durationMin
        minStintMin = s.minStintMin
        maxStintMin = s.maxStintMin
        minPits = s.minPits
        pitTimeS = s.pitTimeS
        minDriverTimeMin = s.minDriverTimeMin
        rain = s.rain
        pitClosedStartMin = s.pitClosedStartMin
        pitClosedEndMin = s.pitClosedEndMin
        boxLines = s.boxLines
        boxKarts = s.boxKarts
        ourKartNumber = s.ourKartNumber
        refreshIntervalS = s.refreshIntervalS
    }

    private func save() async {
        guard circuitId != 0 else { return }
        saving = true
        defer { saving = false }
        let draft = RaceSession(
            id: app.config.activeSession?.id,
            circuitId: circuitId,
            circuitName: nil,
            name: name.isEmpty ? nil : name,
            durationMin: durationMin,
            minStintMin: minStintMin,
            maxStintMin: maxStintMin,
            minPits: minPits,
            pitTimeS: pitTimeS,
            minDriverTimeMin: minDriverTimeMin,
            rain: rain,
            pitClosedStartMin: pitClosedStartMin,
            pitClosedEndMin: pitClosedEndMin,
            boxLines: boxLines,
            boxKarts: boxKarts,
            ourKartNumber: ourKartNumber,
            refreshIntervalS: refreshIntervalS,
            isActive: true,
            // Carry over existing team_drivers_count to avoid blanking
            // it when the strategist edits other fields in this older
            // SessionsView UI (which doesn't expose the field yet).
            teamDriversCount: app.config.activeSession?.teamDriversCount
        )
        if let saved = await app.config.saveSession(draft) {
            apply(saved)
        }
    }
}
