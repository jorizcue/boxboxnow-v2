import SwiftUI

/// Config module — a single side-by-side screen that mirrors the web
/// `/config` page: race session parameters on the left, team list on the right.
///
/// The old sub-sidebar with Sessions / Teams / Circuits / Presets / Preferences
/// was removed: Circuits / Presets / Preferences were scaffolding that never
/// matched the web product, and Sessions + Teams belong together on the same
/// screen (they're always edited as a single "race configuration" unit).
struct ConfigView: View {
    @Environment(AppStore.self) private var app

    // Session form state (mirrors the fields SessionsView used)
    @State private var name: String = ""
    @State private var circuitId: Int = 0
    @State private var durationMin: Int = 60
    @State private var minStintMin: Int = 5
    @State private var maxStintMin: Int = 35
    @State private var minPits: Int = 2
    @State private var pitTimeS: Int = 180
    @State private var minDriverTimeMin: Int = 60
    @State private var rain: Bool = false
    @State private var pitClosedStartMin: Int = 5
    @State private var pitClosedEndMin: Int = 5
    @State private var boxLines: Int = 1
    @State private var boxKarts: Int = 1
    @State private var ourKartNumber: Int = 1
    @State private var refreshIntervalS: Int = 3
    @State private var savingSession: Bool = false

    // Teams state (mirrors TeamsView)
    @State private var draftTeams: [Team] = []
    @State private var expandedTeams: Set<UUID> = []
    @State private var savingTeams: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            sessionPane
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider().overlay(BBNColors.border)
            teamsPane
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(BBNColors.background)
        .task { await loadAll() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Configuración")
    }

    // MARK: - Session pane (left)

    private var sessionPane: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                sessionHeader
                if app.config.isLoadingSession && app.config.activeSession == nil {
                    ProgressView()
                        .tint(BBNColors.accent)
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    circuitBlock
                    parametersBlock
                    rainToggle
                    saveSessionButton
                }
            }
            .padding(20)
        }
    }

    private var sessionHeader: some View {
        HStack(spacing: 10) {
            Text("SESION DE CARRERA")
                .font(.system(size: 13, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
            if app.config.activeSession != nil {
                Text("ACTIVA")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(BBNColors.accent.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    private var circuitBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("CIRCUITO")
                .font(.system(size: 10, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textMuted)
            if app.config.circuits.isEmpty {
                Text("Cargando circuitos…")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textDim)
                    .padding(.vertical, 12)
            } else {
                Menu {
                    Button("Selecciona un circuito") { circuitId = 0 }
                    ForEach(app.config.circuits) { circuit in
                        Button(circuit.name) { circuitId = circuit.id }
                    }
                } label: {
                    HStack {
                        Text(currentCircuitName)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(BBNColors.textPrimary)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(BBNColors.textDim)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(BBNColors.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(BBNColors.border, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            TextField("Nombre de la sesion", text: $name)
                .textFieldStyle(.roundedBorder)
                .font(BBNTypography.body)
                .padding(.top, 2)
        }
    }

    private var currentCircuitName: String {
        if circuitId == 0 { return "Selecciona un circuito" }
        return app.config.circuits.first { $0.id == circuitId }?.name ?? "—"
    }

    private var parametersBlock: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
            numTile("NUESTRO KART", value: $ourKartNumber, range: 0...999, highlight: true)
            numTile("DURACION (MIN)", value: $durationMin, range: 1...600)
            numTile("PITS MINIMOS", value: $minPits, range: 0...50)
            numTile("TIEMPO PIT (S)", value: $pitTimeS, range: 0...600)
            numTile("STINT MIN (MIN)", value: $minStintMin, range: 0...120)
            numTile("STINT MAX (MIN)", value: $maxStintMin, range: 0...240)
            numTile("MIN PILOTO (MIN)", value: $minDriverTimeMin, range: 0...600)
            numTile("PIT CERR. INI (MIN)", value: $pitClosedStartMin, range: 0...120)
            numTile("PIT CERR. FIN (MIN)", value: $pitClosedEndMin, range: 0...120)
            numTile("LINEAS DE BOX", value: $boxLines, range: 1...10)
            numTile("KARTS DE BOX", value: $boxKarts, range: 1...200)
            numTile("REFRESH (S)", value: $refreshIntervalS, range: 1...60)
        }
    }

    /// iPad-friendly numeric tile — label on top, large value in the middle,
    /// Stepper underneath for increment/decrement. Matches the web "big number
    /// card" visual but keeps the iOS Stepper so touch input feels native.
    @ViewBuilder
    private func numTile(_ label: String, value: Binding<Int>, range: ClosedRange<Int>, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(BBNColors.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text("\(value.wrappedValue)")
                .font(.system(size: 26, weight: .black, design: .monospaced))
                .foregroundStyle(highlight ? BBNColors.accent : BBNColors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .center)
            Stepper("", value: value, in: range)
                .labelsHidden()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(BBNColors.card)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(highlight ? BBNColors.accent.opacity(0.45) : BBNColors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var rainToggle: some View {
        Toggle(isOn: $rain) {
            Text("Lluvia")
                .font(BBNTypography.body)
                .foregroundStyle(BBNColors.textPrimary)
        }
        .tint(BBNColors.accent)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(BBNColors.card)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(BBNColors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var saveSessionButton: some View {
        Button {
            Task { await saveSession() }
        } label: {
            Text(savingSession ? "GUARDANDO…" : (app.config.activeSession == nil ? "CREAR SESION" : "ACTUALIZAR SESION"))
                .font(.system(size: 14, weight: .bold))
                .tracking(1)
                .foregroundStyle(Color.black)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(circuitId == 0 || savingSession ? BBNColors.accent.opacity(0.4) : BBNColors.accent)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(circuitId == 0 || savingSession)
    }

    // MARK: - Teams pane (right)

    private var teamsPane: some View {
        VStack(spacing: 0) {
            teamsHeader
            teamsBody
        }
    }

    private var teamsHeader: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text("EQUIPOS Y PILOTOS")
                    .font(.system(size: 13, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textPrimary)
                Text("arrastra para reordenar")
                    .font(.system(size: 10))
                    .foregroundStyle(BBNColors.textDim)
            }
            Spacer()
            Button {
                addTeam()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                    Text("Equipo").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(BBNColors.accent)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(BBNColors.accent.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .disabled(app.config.activeSession == nil)

            Button {
                Task { await saveTeams() }
            } label: {
                Text(savingTeams ? "…" : "Guardar")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(savingTeams ? BBNColors.accent.opacity(0.5) : BBNColors.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .disabled(savingTeams || app.config.activeSession == nil)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private var teamsBody: some View {
        if app.config.activeSession == nil && !app.config.isLoadingSession {
            PlaceholderView(text: "Crea una sesion activa antes de gestionar equipos")
        } else if app.config.isLoadingTeams && draftTeams.isEmpty {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if draftTeams.isEmpty {
            PlaceholderView(text: "Sin equipos — pulsa “+ Equipo”")
        } else {
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach($draftTeams) { $team in
                        teamRow(team: $team)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    @ViewBuilder
    private func teamRow(team: Binding<Team>) -> some View {
        let index = team.wrappedValue.position - 1
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 12))
                    .foregroundStyle(BBNColors.textDim)
                    .frame(width: 14)

                Text("\(team.wrappedValue.position)")
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(BBNColors.textMuted)
                    .frame(width: 24, alignment: .leading)

                Stepper(value: team.kart, in: 0...999) {
                    Text("\(team.wrappedValue.kart)")
                        .font(.system(size: 14, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(BBNColors.accent)
                        .frame(minWidth: 36, alignment: .center)
                }
                .labelsHidden()
                .frame(width: 150)

                TextField("Nombre del equipo", text: team.teamName)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 14))
                    .frame(maxWidth: .infinity)

                Text(team.wrappedValue.drivers.isEmpty ? "sin pilotos" : "\(team.wrappedValue.drivers.count) pilotos")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)
                    .frame(width: 80, alignment: .trailing)

                Button { moveTeamUp(index) } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 11))
                        .foregroundStyle(BBNColors.textMuted)
                }
                .disabled(index == 0)
                .buttonStyle(.plain)

                Button { moveTeamDown(index) } label: {
                    Image(systemName: "arrow.down")
                        .font(.system(size: 11))
                        .foregroundStyle(BBNColors.textMuted)
                }
                .disabled(index == draftTeams.count - 1)
                .buttonStyle(.plain)

                Button { toggleExpand(team.wrappedValue.id) } label: {
                    Image(systemName: expandedTeams.contains(team.wrappedValue.id) ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12))
                        .foregroundStyle(BBNColors.textMuted)
                }
                .buttonStyle(.plain)

                Button { removeTeam(id: team.wrappedValue.id) } label: {
                    Text("X")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(BBNColors.textDim)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(BBNColors.card)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            if expandedTeams.contains(team.wrappedValue.id) {
                driversSection(team: team)
                    .padding(.top, 6)
                    .padding(.horizontal, 4)
            }
        }
    }

    @ViewBuilder
    private func driversSection(team: Binding<Team>) -> some View {
        let teamId = team.wrappedValue.id
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("PILOTOS")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textMuted)
                Spacer()
                Button { addDriver(teamId: teamId) } label: {
                    Label("Añadir piloto", systemImage: "plus")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(BBNColors.accent)
                }
                .buttonStyle(.plain)
            }
            if team.wrappedValue.drivers.isEmpty {
                Text("Sin pilotos")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)
            } else {
                ForEach(team.drivers) { $driver in
                    HStack(spacing: 8) {
                        TextField("Nombre del piloto", text: $driver.driverName)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 13))
                        Stepper(value: $driver.differentialMs, in: -60_000...60_000, step: 100) {
                            Text("\(driver.wrappedValue.differentialMs) ms")
                                .font(.system(size: 12))
                                .monospacedDigit()
                                .foregroundStyle(diffColor(driver.wrappedValue.differentialMs))
                                .frame(minWidth: 76, alignment: .trailing)
                        }
                        .labelsHidden()
                        .frame(width: 180)
                        Button { removeDriver(teamId: teamId, driverId: driver.wrappedValue.id) } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(BBNColors.danger)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(10)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func diffColor(_ ms: Int) -> Color {
        if ms < 0 { return BBNColors.accent }
        if ms > 0 { return BBNColors.danger }
        return BBNColors.textMuted
    }

    // MARK: - IO

    private func loadAll() async {
        if app.config.circuits.isEmpty {
            await app.config.refresh()
        }
        await app.config.reloadActiveSession()
        if let s = app.config.activeSession {
            applySession(s)
            await app.config.reloadTeams()
            draftTeams = app.config.teams
            expandedTeams = []
            renumberTeams()
        }
    }

    private func applySession(_ s: RaceSession) {
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

    private func saveSession() async {
        guard circuitId != 0 else { return }
        savingSession = true
        defer { savingSession = false }
        let draft = RaceSession(
            id: app.config.activeSession?.id,
            circuitId: circuitId, circuitName: nil,
            name: name.isEmpty ? nil : name,
            durationMin: durationMin, minStintMin: minStintMin, maxStintMin: maxStintMin,
            minPits: minPits, pitTimeS: pitTimeS, minDriverTimeMin: minDriverTimeMin,
            rain: rain, pitClosedStartMin: pitClosedStartMin, pitClosedEndMin: pitClosedEndMin,
            boxLines: boxLines, boxKarts: boxKarts, ourKartNumber: ourKartNumber,
            refreshIntervalS: refreshIntervalS, isActive: true
        )
        if let saved = await app.config.saveSession(draft) {
            applySession(saved)
            await app.config.reloadTeams()
            draftTeams = app.config.teams
            renumberTeams()
        }
    }

    // MARK: - Team mutations

    private func addTeam() {
        let team = Team(position: draftTeams.count + 1, kart: 0, teamName: "", drivers: [])
        draftTeams.append(team)
        expandedTeams.insert(team.id)
        renumberTeams()
    }

    private func removeTeam(id: UUID) {
        guard let idx = draftTeams.firstIndex(where: { $0.id == id }) else { return }
        draftTeams.remove(at: idx)
        expandedTeams.remove(id)
        renumberTeams()
    }

    private func moveTeamUp(_ i: Int) {
        guard i > 0 else { return }
        draftTeams.swapAt(i, i - 1)
        renumberTeams()
    }

    private func moveTeamDown(_ i: Int) {
        guard i < draftTeams.count - 1 else { return }
        draftTeams.swapAt(i, i + 1)
        renumberTeams()
    }

    private func toggleExpand(_ id: UUID) {
        if expandedTeams.contains(id) { expandedTeams.remove(id) } else { expandedTeams.insert(id) }
    }

    private func addDriver(teamId: UUID) {
        guard let idx = draftTeams.firstIndex(where: { $0.id == teamId }) else { return }
        draftTeams[idx].drivers.append(TeamDriver(driverName: "", differentialMs: 0))
    }

    private func removeDriver(teamId: UUID, driverId: UUID) {
        guard let ti = draftTeams.firstIndex(where: { $0.id == teamId }) else { return }
        guard let di = draftTeams[ti].drivers.firstIndex(where: { $0.id == driverId }) else { return }
        draftTeams[ti].drivers.remove(at: di)
    }

    private func renumberTeams() {
        for i in draftTeams.indices { draftTeams[i].position = i + 1 }
    }

    private func saveTeams() async {
        guard app.config.activeSession != nil else { return }
        savingTeams = true
        defer { savingTeams = false }
        renumberTeams()
        let expandedPositions: Set<Int> = Set(
            draftTeams.compactMap { expandedTeams.contains($0.id) ? $0.position : nil }
        )
        if await app.config.saveTeams(draftTeams) {
            draftTeams = app.config.teams
            renumberTeams()
            expandedTeams = Set(
                draftTeams.compactMap { expandedPositions.contains($0.position) ? $0.id : nil }
            )
        }
    }
}
