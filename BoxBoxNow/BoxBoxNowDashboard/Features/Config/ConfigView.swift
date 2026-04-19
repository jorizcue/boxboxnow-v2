import SwiftUI
import UniformTypeIdentifiers

/// Config module. Mirrors the web `/config` page but splits it into two
/// sub-tabs so each pane gets the full width on the iPad (the previous
/// side-by-side split made team names unreadable):
///
///   Sidebar: [Sesion de carrera] [Equipos y pilotos]
///
///   ├─ Sesion de carrera — circuit picker + numeric tiles (text-editable)
///   │                      + "Actualizar sesion" button
///   └─ Equipos y pilotos — Auto-load toggle, Cargar Live button, + Equipo,
///                          Guardar, and a drag-to-reorder list
///
/// The previous Config had Sessions / Teams / Circuits / Presets / Preferences
/// sub-tabs; we removed the last three earlier and merged Sessions+Teams into
/// one screen. This re-splits into the two legitimate sub-screens.
struct ConfigView: View {
    @Environment(AppStore.self) private var app

    enum SubTab: String, CaseIterable, Identifiable {
        case session, teams
        var id: String { rawValue }
        var title: String {
            switch self {
            case .session: return "Sesion de carrera"
            case .teams:   return "Equipos y pilotos"
            }
        }
        var icon: String {
            switch self {
            case .session: return "flag.checkered"
            case .teams:   return "person.3.fill"
            }
        }
    }

    @State private var subtab: SubTab = .session

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Divider().overlay(BBNColors.border)
            Group {
                switch subtab {
                case .session: SessionEditor()
                case .teams:   TeamsEditor()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BBNColors.background)
        }
        .background(BBNColors.background)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Configuración")
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("CONFIGURACION")
                .font(.system(size: 10, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textDim)
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 8)
            ForEach(SubTab.allCases) { tab in
                Button { subtab = tab } label: {
                    HStack(spacing: 10) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 14))
                            .frame(width: 18)
                        Text(tab.title)
                            .font(.system(size: 14, weight: subtab == tab ? .semibold : .regular))
                        Spacer()
                    }
                    .foregroundStyle(subtab == tab ? BBNColors.accent : BBNColors.textMuted)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(subtab == tab ? BBNColors.accent.opacity(0.12) : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.horizontal, 8)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .frame(width: 240)
        .frame(maxHeight: .infinity)
        .background(BBNColors.surface)
    }
}

// ============================================================================
// MARK: - Session editor
// ============================================================================

private struct SessionEditor: View {
    @Environment(AppStore.self) private var app

    @State private var name: String = ""
    @State private var circuitId: Int = 0
    @State private var durationMin: Int = 60
    @State private var minStintMin: Int = 5
    @State private var maxStintMin: Int = 35
    @State private var minPits: Int = 2
    @State private var pitTimeS: Int = 180
    @State private var minDriverTimeMin: Int = 60
    @State private var pitClosedStartMin: Int = 5
    @State private var pitClosedEndMin: Int = 5
    @State private var boxLines: Int = 1
    @State private var boxKarts: Int = 1
    @State private var ourKartNumber: Int = 1
    @State private var refreshIntervalS: Int = 3
    @State private var saving: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if app.config.isLoadingSession && app.config.activeSession == nil {
                    ProgressView().tint(BBNColors.accent)
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    circuitBlock
                    parametersGrid
                    saveButton
                }
            }
            .padding(24)
            .frame(maxWidth: 820, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(BBNColors.background)
        .task { await loadFromServer() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Text("SESION DE CARRERA")
                .font(.system(size: 14, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
            if app.config.activeSession != nil {
                Text("ACTIVA")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
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

    private var parametersGrid: some View {
        // 3 columns, matches the web "big number card" grid.
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
            NumTile(label: "NUESTRO KART", value: $ourKartNumber, range: 0...999, highlight: true)
            NumTile(label: "DURACION (MIN)", value: $durationMin, range: 1...600)
            NumTile(label: "PITS MINIMOS", value: $minPits, range: 0...50)
            NumTile(label: "TIEMPO PIT (S)", value: $pitTimeS, range: 0...600)
            NumTile(label: "STINT MIN (MIN)", value: $minStintMin, range: 0...120)
            NumTile(label: "STINT MAX (MIN)", value: $maxStintMin, range: 0...240)
            NumTile(label: "MIN PILOTO (MIN)", value: $minDriverTimeMin, range: 0...600)
            NumTile(label: "PIT CERR. INI (MIN)", value: $pitClosedStartMin, range: 0...120)
            NumTile(label: "PIT CERR. FIN (MIN)", value: $pitClosedEndMin, range: 0...120)
            NumTile(label: "LINEAS DE BOX", value: $boxLines, range: 1...10)
            NumTile(label: "KARTS DE BOX", value: $boxKarts, range: 1...200)
            NumTile(label: "REFRESH (S)", value: $refreshIntervalS, range: 1...60)
        }
    }

    private var saveButton: some View {
        Button {
            Task { await save() }
        } label: {
            Text(saving ? "GUARDANDO…" : (app.config.activeSession == nil ? "CREAR SESION" : "ACTUALIZAR SESION"))
                .font(.system(size: 15, weight: .bold))
                .tracking(1)
                .foregroundStyle(Color.black)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(circuitId == 0 || saving ? BBNColors.accent.opacity(0.4) : BBNColors.accent)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(circuitId == 0 || saving)
        .padding(.top, 4)
    }

    // MARK: IO

    private func loadFromServer() async {
        if app.config.circuits.isEmpty { await app.config.refresh() }
        await app.config.reloadActiveSession()
        if let s = app.config.activeSession { apply(s) }
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
        pitClosedStartMin = s.pitClosedStartMin
        pitClosedEndMin = s.pitClosedEndMin
        boxLines = s.boxLines
        boxKarts = s.boxKarts
        ourKartNumber = s.ourKartNumber
        refreshIntervalS = s.refreshIntervalS
    }

    private func save() async {
        guard circuitId != 0 else { return }
        saving = true; defer { saving = false }
        let existing = app.config.activeSession
        let draft = RaceSession(
            id: existing?.id,
            circuitId: circuitId, circuitName: nil,
            name: name.isEmpty ? nil : name,
            durationMin: durationMin, minStintMin: minStintMin, maxStintMin: maxStintMin,
            minPits: minPits, pitTimeS: pitTimeS, minDriverTimeMin: minDriverTimeMin,
            rain: existing?.rain ?? false,
            pitClosedStartMin: pitClosedStartMin, pitClosedEndMin: pitClosedEndMin,
            boxLines: boxLines, boxKarts: boxKarts, ourKartNumber: ourKartNumber,
            refreshIntervalS: refreshIntervalS, isActive: true,
            autoLoadTeams: existing?.autoLoadTeams
        )
        if let saved = await app.config.saveSession(draft) { apply(saved) }
    }
}

/// Numeric tile matching the web's "big number card" look: label on top,
/// large number in the middle (tap to edit as text), +/- Stepper underneath.
/// The value is text-editable via a hidden TextField backed by a String so
/// the user can type arbitrary numbers, not just click +/- repeatedly.
private struct NumTile: View {
    let label: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    var highlight: Bool = false

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(BBNColors.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            TextField("", text: $text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 30, weight: .black, design: .monospaced))
                .foregroundStyle(highlight ? BBNColors.accent : BBNColors.textPrimary)
                .focused($focused)
                .onChange(of: text) { _, new in
                    // Keep only digits; commit to bound value clamped to range.
                    let digits = new.filter { $0.isNumber }
                    if digits != new { text = digits }
                    if let n = Int(digits) { value = min(max(n, range.lowerBound), range.upperBound) }
                }
                .onChange(of: focused) { _, isFocused in
                    // Re-sync on blur so the visible text reflects the clamped value.
                    if !isFocused { text = String(value) }
                }
            Stepper("", value: $value, in: range)
                .labelsHidden()
                .onChange(of: value) { _, newValue in
                    if !focused { text = String(newValue) }
                }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(BBNColors.card)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(highlight ? BBNColors.accent.opacity(0.45) : BBNColors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onAppear { text = String(value) }
    }
}

// ============================================================================
// MARK: - Teams editor
// ============================================================================

private struct TeamsEditor: View {
    @Environment(AppStore.self) private var app

    @State private var draft: [Team] = []
    @State private var expanded: Set<UUID> = []
    @State private var autoLoad: Bool = false
    @State private var savingTeams: Bool = false
    @State private var savingAuto: Bool = false
    @State private var loadingLive: Bool = false
    @State private var liveMessage: String? = nil
    @State private var draggingId: UUID? = nil

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await loadAll() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text("EQUIPOS Y PILOTOS")
                    .font(.system(size: 14, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textPrimary)
                Text("arrastra el punteado para reordenar")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)
            }
            Spacer()

            // AUTO toggle — when on, the editor listens for `teams_updated`
            // WS events and reloads from the server automatically.
            HStack(spacing: 6) {
                Text("AUTO")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(autoLoad ? BBNColors.accent : BBNColors.textDim)
                Toggle("", isOn: $autoLoad)
                    .labelsHidden()
                    .tint(BBNColors.accent)
                    .onChange(of: autoLoad) { _, newValue in
                        Task { await toggleAutoLoad(newValue) }
                    }
            }

            Button { Task { await loadLive() } } label: {
                HStack(spacing: 6) {
                    if loadingLive { ProgressView().scaleEffect(0.6) }
                    Text("Cargar Live").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(BBNColors.accent)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(BBNColors.accent.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .disabled(loadingLive || app.config.activeSession == nil)

            Button { addTeam() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                    Text("Equipo").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(BBNColors.accent)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(BBNColors.accent.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .disabled(app.config.activeSession == nil)

            Button { Task { await saveTeams() } } label: {
                Text(savingTeams ? "…" : "Guardar")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.black)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
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
    private var content: some View {
        if let msg = liveMessage {
            Text(msg)
                .font(.system(size: 12))
                .foregroundStyle(BBNColors.textDim)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.bottom, 4)
        }
        if app.config.activeSession == nil && !app.config.isLoadingSession {
            PlaceholderView(text: "Crea una sesion activa antes de gestionar equipos")
        } else if app.config.isLoadingTeams && draft.isEmpty {
            ProgressView().tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if draft.isEmpty {
            PlaceholderView(text: "Sin equipos — pulsa “+ Equipo” o “Cargar Live”")
        } else {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(draft) { team in
                        teamRow(team)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
        }
    }

    @ViewBuilder
    private func teamRow(_ team: Team) -> some View {
        let index = team.position - 1
        let expandedState = expanded.contains(team.id)
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                // Drag handle — NSItemProvider carries the team id as a
                // string; the drop delegate resolves it back to an index
                // and applies an `arrayMove`-style reorder (move, not swap).
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 14))
                    .foregroundStyle(draggingId == team.id ? BBNColors.accent : BBNColors.textMuted)
                    .frame(width: 18)
                    .onDrag {
                        draggingId = team.id
                        return NSItemProvider(object: team.id.uuidString as NSString)
                    }

                Text("\(team.position)")
                    .font(.system(size: 14, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(BBNColors.textMuted)
                    .frame(width: 24, alignment: .leading)

                // Kart number stepper
                HStack(spacing: 6) {
                    Button { updateKart(team.id, delta: -1) } label: {
                        Image(systemName: "minus").font(.system(size: 12, weight: .bold))
                    }.buttonStyle(.plain)
                    Text("\(team.kart)")
                        .font(.system(size: 15, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(BBNColors.accent)
                        .frame(minWidth: 32, alignment: .center)
                    Button { updateKart(team.id, delta: 1) } label: {
                        Image(systemName: "plus").font(.system(size: 12, weight: .bold))
                    }.buttonStyle(.plain)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(BBNColors.surface)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(BBNColors.border, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .frame(width: 130)

                // Team name
                TextField("Nombre del equipo", text: nameBinding(for: team.id))
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 15))
                    .frame(maxWidth: .infinity)

                Text(team.drivers.isEmpty ? "sin pilotos" : "\(team.drivers.count) pilotos")
                    .font(.system(size: 12))
                    .foregroundStyle(BBNColors.textDim)
                    .frame(width: 80, alignment: .trailing)

                Button { toggleExpand(team.id) } label: {
                    Image(systemName: expandedState ? "chevron.up" : "chevron.down")
                        .font(.system(size: 13))
                        .foregroundStyle(BBNColors.textMuted)
                }.buttonStyle(.plain)

                Button { removeTeam(team.id) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(BBNColors.textDim)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(BBNColors.card)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .onDrop(of: [.text], delegate: TeamDropDelegate(
                targetId: team.id,
                draft: $draft,
                draggingId: $draggingId,
                onReorder: { renumber() }
            ))

            if expandedState {
                driversSection(for: team)
                    .padding(.top, 6)
            }
        }
    }

    private func driversSection(for team: Team) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("PILOTOS")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textMuted)
                Spacer()
                Button { addDriver(team.id) } label: {
                    Label("Añadir piloto", systemImage: "plus")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(BBNColors.accent)
                }.buttonStyle(.plain)
            }
            if team.drivers.isEmpty {
                Text("Sin pilotos")
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)
            } else {
                ForEach(team.drivers) { driver in
                    HStack(spacing: 8) {
                        TextField("Nombre del piloto", text: driverNameBinding(teamId: team.id, driverId: driver.id))
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 13))
                        Stepper(value: driverDiffBinding(teamId: team.id, driverId: driver.id), in: -60_000...60_000, step: 100) {
                            Text("\(driver.differentialMs) ms")
                                .font(.system(size: 12))
                                .monospacedDigit()
                                .foregroundStyle(diffColor(driver.differentialMs))
                                .frame(minWidth: 76, alignment: .trailing)
                        }
                        .labelsHidden()
                        .frame(width: 180)
                        Button { removeDriver(teamId: team.id, driverId: driver.id) } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(BBNColors.danger)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(12)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Bindings

    private func nameBinding(for id: UUID) -> Binding<String> {
        Binding(
            get: { draft.first { $0.id == id }?.teamName ?? "" },
            set: { new in if let i = draft.firstIndex(where: { $0.id == id }) { draft[i].teamName = new } }
        )
    }

    private func driverNameBinding(teamId: UUID, driverId: UUID) -> Binding<String> {
        Binding(
            get: {
                guard let ti = draft.firstIndex(where: { $0.id == teamId }),
                      let di = draft[ti].drivers.firstIndex(where: { $0.id == driverId }) else { return "" }
                return draft[ti].drivers[di].driverName
            },
            set: { new in
                guard let ti = draft.firstIndex(where: { $0.id == teamId }),
                      let di = draft[ti].drivers.firstIndex(where: { $0.id == driverId }) else { return }
                draft[ti].drivers[di].driverName = new
            }
        )
    }

    private func driverDiffBinding(teamId: UUID, driverId: UUID) -> Binding<Int> {
        Binding(
            get: {
                guard let ti = draft.firstIndex(where: { $0.id == teamId }),
                      let di = draft[ti].drivers.firstIndex(where: { $0.id == driverId }) else { return 0 }
                return draft[ti].drivers[di].differentialMs
            },
            set: { new in
                guard let ti = draft.firstIndex(where: { $0.id == teamId }),
                      let di = draft[ti].drivers.firstIndex(where: { $0.id == driverId }) else { return }
                draft[ti].drivers[di].differentialMs = new
            }
        )
    }

    private func diffColor(_ ms: Int) -> Color {
        if ms < 0 { return BBNColors.accent }
        if ms > 0 { return BBNColors.danger }
        return BBNColors.textMuted
    }

    // MARK: Mutations

    private func updateKart(_ id: UUID, delta: Int) {
        guard let i = draft.firstIndex(where: { $0.id == id }) else { return }
        draft[i].kart = max(0, min(999, draft[i].kart + delta))
    }

    private func addTeam() {
        let team = Team(position: draft.count + 1, kart: 0, teamName: "", drivers: [])
        draft.append(team)
        expanded.insert(team.id)
        renumber()
    }

    private func removeTeam(_ id: UUID) {
        guard let i = draft.firstIndex(where: { $0.id == id }) else { return }
        draft.remove(at: i)
        expanded.remove(id)
        renumber()
    }

    private func toggleExpand(_ id: UUID) {
        if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
    }

    private func addDriver(_ teamId: UUID) {
        guard let i = draft.firstIndex(where: { $0.id == teamId }) else { return }
        draft[i].drivers.append(TeamDriver(driverName: "", differentialMs: 0))
    }

    private func removeDriver(teamId: UUID, driverId: UUID) {
        guard let ti = draft.firstIndex(where: { $0.id == teamId }) else { return }
        guard let di = draft[ti].drivers.firstIndex(where: { $0.id == driverId }) else { return }
        draft[ti].drivers.remove(at: di)
    }

    private func renumber() {
        for i in draft.indices { draft[i].position = i + 1 }
    }

    // MARK: IO

    private func loadAll() async {
        if app.config.circuits.isEmpty { await app.config.refresh() }
        await app.config.reloadActiveSession()
        if let session = app.config.activeSession {
            autoLoad = session.autoLoadTeams ?? false
            await app.config.reloadTeams()
            draft = app.config.teams
            expanded = []
            renumber()
        }
    }

    private func toggleAutoLoad(_ value: Bool) async {
        guard let existing = app.config.activeSession else { return }
        savingAuto = true; defer { savingAuto = false }
        let draftSession = RaceSession(
            id: existing.id,
            circuitId: existing.circuitId, circuitName: existing.circuitName,
            name: existing.name,
            durationMin: existing.durationMin, minStintMin: existing.minStintMin, maxStintMin: existing.maxStintMin,
            minPits: existing.minPits, pitTimeS: existing.pitTimeS, minDriverTimeMin: existing.minDriverTimeMin,
            rain: existing.rain,
            pitClosedStartMin: existing.pitClosedStartMin, pitClosedEndMin: existing.pitClosedEndMin,
            boxLines: existing.boxLines, boxKarts: existing.boxKarts, ourKartNumber: existing.ourKartNumber,
            refreshIntervalS: existing.refreshIntervalS, isActive: true,
            autoLoadTeams: value
        )
        _ = await app.config.saveSession(draftSession)
    }

    private func loadLive() async {
        loadingLive = true; defer { loadingLive = false }
        do {
            let resp = try await ConfigService().liveTeams()
            // Merge with existing: keep local order and drivers, but update
            // team name for matching karts; new karts get appended at the
            // end. `resp.teams` is `[Team]` (the shared model that already
            // decodes `team_name` / nested `driver_name` + `differential_ms`).
            var byKart: [Int: Int] = [:]
            for (i, t) in draft.enumerated() { byKart[t.kart] = i }
            var merged = draft
            for live in resp.teams {
                if let i = byKart[live.kart] {
                    merged[i].teamName = live.teamName.isEmpty ? merged[i].teamName : live.teamName
                    // Append any new drivers not already present (dedup by lowercase name).
                    // Preserves existing differentials on matching names.
                    let have = Set(merged[i].drivers.map { $0.driverName.lowercased() })
                    for d in live.drivers where !d.driverName.isEmpty && !have.contains(d.driverName.lowercased()) {
                        merged[i].drivers.append(TeamDriver(driverName: d.driverName, differentialMs: 0))
                    }
                } else {
                    let newTeam = Team(
                        position: merged.count + 1,
                        kart: live.kart,
                        teamName: live.teamName,
                        drivers: live.drivers.map {
                            TeamDriver(driverName: $0.driverName, differentialMs: 0)
                        }
                    )
                    merged.append(newTeam)
                }
            }
            draft = merged
            renumber()
            liveMessage = resp.hasDrivers
                ? "Cargados \(resp.kartCount) karts con pilotos desde Live"
                : "Cargados \(resp.kartCount) karts desde Live (sin pilotos)"
        } catch {
            liveMessage = "No se pudo cargar Live: \(error.localizedDescription)"
        }
    }

    private func saveTeams() async {
        guard app.config.activeSession != nil else { return }
        savingTeams = true; defer { savingTeams = false }
        renumber()
        let expandedPositions: Set<Int> = Set(
            draft.compactMap { expanded.contains($0.id) ? $0.position : nil }
        )
        if await app.config.saveTeams(draft) {
            draft = app.config.teams
            renumber()
            expanded = Set(draft.compactMap { expandedPositions.contains($0.position) ? $0.id : nil })
        }
    }
}

// MARK: - Drag & drop

/// Drop delegate that implements move-semantics reordering — mirrors the
/// web's `arrayMove(prev, oldIndex, newIndex)` behavior (not swap).
private struct TeamDropDelegate: DropDelegate {
    let targetId: UUID
    @Binding var draft: [Team]
    @Binding var draggingId: UUID?
    let onReorder: () -> Void

    func performDrop(info: DropInfo) -> Bool {
        draggingId = nil
        return true
    }

    func dropEntered(info: DropInfo) {
        guard let dragging = draggingId, dragging != targetId else { return }
        guard let fromIdx = draft.firstIndex(where: { $0.id == dragging }),
              let toIdx = draft.firstIndex(where: { $0.id == targetId }) else { return }
        if fromIdx == toIdx { return }
        let item = draft.remove(at: fromIdx)
        let insertAt = toIdx > fromIdx ? toIdx : toIdx
        draft.insert(item, at: insertAt)
        onReorder()
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }
}
