import SwiftUI

/// Box configuration: teams + drivers management (mirrors web TeamEditor).
/// - Auto-load toggle (persists on /config/session.auto_load_teams)
/// - Load from live timing (replaces all teams)
/// - Add team via popup (name + kart number)
/// - Per team: kart number, team name, driver list
/// - Per driver: name, differential_ms (seconds step)
/// - Teams are read-only by default; edit button enables editing
struct BoxConfigView: View {
    @EnvironmentObject var toast: ToastManager

    @State private var teams: [Team] = []
    @State private var autoLoad: Bool = false
    @State private var expandedTeamIds: Set<UUID> = []
    @State private var loading = true
    @State private var saving = false
    @State private var importing = false
    @State private var isEditing = false
    @State private var showAddTeamSheet = false
    @State private var newTeamName = ""
    @State private var newTeamKart = ""

    var body: some View {
        List {
            // ── Header: auto-load toggle ──
            Section {
                Toggle(isOn: Binding(
                    get: { autoLoad },
                    set: { newValue in
                        autoLoad = newValue
                        Task { await saveAutoLoad(newValue) }
                    }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Auto-cargar al iniciar")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Refresca equipos desde Live Timing al arrancar la carrera.")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }
            }

            // ── Actions ──
            Section {
                Button {
                    Task { await importFromLive() }
                } label: {
                    HStack {
                        if importing {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.down.circle")
                        }
                        Text("Cargar desde Live Timing")
                    }
                }
                .disabled(importing)

                Button {
                    showAddTeamSheet = true
                } label: {
                    Label("Anadir equipo", systemImage: "plus.circle")
                }
            }

            // ── Team list ──
            if teams.isEmpty && !loading {
                Section {
                    Text("No hay equipos. Cargalos desde Live Timing o anadelos manualmente.")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                        .padding(.vertical, 12)
                }
            } else {
                Section("Equipos (\(teams.count))") {
                    ForEach($teams) { $team in
                        TeamRowView(
                            team: $team,
                            isExpanded: expandedTeamIds.contains(team.id),
                            isEditing: isEditing,
                            onToggleExpanded: { toggleExpanded(team.id) },
                            onRemove: { removeTeam(team.id) }
                        )
                    }
                    .onMove { from, to in
                        moveTeam(from: from, to: to)
                    }
                }
            }

            // ── Save button (matches "Actualizar sesion" style) ──
            Section {
                Button(action: { Task { await saveTeams() } }) {
                    HStack {
                        if saving {
                            ProgressView().tint(.black)
                        }
                        Text("GUARDAR CAMBIOS")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color.accentColor)
                    .foregroundColor(.black)
                    .cornerRadius(12)
                }
                .disabled(saving)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        // Bind SwiftUI's EditMode to our local `isEditing` so `.onMove`
        // actually lets the user drag rows when "Editar" is on. Without
        // this, the rows render but aren't reorderable — the user sees
        // them snap back to the original order on save because no move
        // ever happened.
        .environment(\.editMode, .constant(isEditing ? .active : .inactive))
        .navigationTitle("Configuracion Box")
        .navigationBarItems(trailing:
            Button(isEditing ? "Listo" : "Editar") {
                withAnimation { isEditing.toggle() }
            }
        )
        .overlay {
            if loading {
                ProgressView()
            }
        }
        .task {
            await loadAll()
        }
        .alert("Anadir equipo", isPresented: $showAddTeamSheet) {
            TextField("Nombre del equipo", text: $newTeamName)
            TextField("Numero de kart", text: $newTeamKart)
                .keyboardType(.numberPad)
            Button("Anadir") { addTeamFromPopup() }
            Button("Cancelar", role: .cancel) {
                newTeamName = ""
                newTeamKart = ""
            }
        } message: {
            Text("Introduce el nombre y numero de kart del nuevo equipo.")
        }
    }

    // MARK: - Loading

    private func loadAll() async {
        loading = true
        defer { loading = false }
        async let sessionTask: () = loadAutoLoad()
        async let teamsTask: () = loadTeams()
        _ = await (sessionTask, teamsTask)
    }

    private func loadAutoLoad() async {
        if let raw = try? await fetchSessionRaw(), let value = raw["auto_load_teams"] as? Bool {
            await MainActor.run { self.autoLoad = value }
        }
    }

    private func fetchSessionRaw() async throws -> [String: Any]? {
        guard let url = URL(string: Constants.apiBaseURL + "/config/session") else { return nil }
        var req = URLRequest(url: url)
        if let token = KeychainHelper.loadToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private func loadTeams() async {
        do {
            let fresh = try await APIClient.shared.getTeams()
            await MainActor.run { self.teams = fresh.sorted { $0.position < $1.position } }
        } catch {
            await MainActor.run { toast.warning("No se pudieron cargar los equipos") }
        }
    }

    // MARK: - Actions

    private func saveAutoLoad(_ value: Bool) async {
        do {
            try await APIClient.shared.patchSession(["auto_load_teams": value])
        } catch {
            await MainActor.run { toast.warning("No se pudo guardar auto-load") }
        }
    }

    /// Loads from live timing, replacing ALL existing teams (clears first).
    private func importFromLive() async {
        importing = true
        defer { importing = false }
        do {
            let live = try await APIClient.shared.getLiveTeams()
            await MainActor.run {
                // Clear existing teams and replace with live data
                let imported = live.teams.enumerated().map { idx, liveTeam -> Team in
                    Team(
                        position: idx + 1,
                        kart: liveTeam.kart,
                        teamName: liveTeam.teamName,
                        drivers: liveTeam.drivers.map {
                            TeamDriver(driverName: $0.driverName, differentialMs: 0)
                        }
                    )
                }
                self.teams = imported
                toast.success("Importados \(live.kartCount) karts (equipos anteriores reemplazados)")
            }
        } catch {
            await MainActor.run { toast.warning("No se pudo cargar Live Timing") }
        }
    }

    private func saveTeams() async {
        saving = true
        defer { saving = false }
        let ordered = teams.enumerated().map { idx, t -> Team in
            var copy = t
            copy.position = idx + 1
            return copy
        }
        do {
            try await APIClient.shared.replaceTeams(ordered)
            await MainActor.run {
                self.teams = ordered
                toast.success("Equipos guardados")
            }
        } catch {
            await MainActor.run { toast.warning("No se pudieron guardar los equipos") }
        }
    }

    private func addTeamFromPopup() {
        let name = newTeamName.trimmingCharacters(in: .whitespaces)
        let kartNum = Int(newTeamKart) ?? ((teams.map { $0.kart }.max() ?? 0) + 1)
        guard !name.isEmpty else {
            newTeamName = ""
            newTeamKart = ""
            return
        }
        let t = Team(position: teams.count + 1, kart: kartNum, teamName: name, drivers: [])
        teams.append(t)
        expandedTeamIds.insert(t.id)
        isEditing = true  // Enable editing after adding
        newTeamName = ""
        newTeamKart = ""
    }

    private func removeTeam(_ id: UUID) {
        teams.removeAll { $0.id == id }
        expandedTeamIds.remove(id)
    }

    private func toggleExpanded(_ id: UUID) {
        if expandedTeamIds.contains(id) {
            expandedTeamIds.remove(id)
        } else {
            expandedTeamIds.insert(id)
        }
    }

    private func moveTeam(from source: IndexSet, to destination: Int) {
        teams.move(fromOffsets: source, toOffset: destination)
    }
}

// MARK: - Team row

private struct TeamRowView: View {
    @Binding var team: Team
    let isExpanded: Bool
    let isEditing: Bool
    let onToggleExpanded: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                // Position badge
                Text("#\(team.position)")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(.secondary)
                    .frame(width: 26)

                if isEditing {
                    // Editable kart number
                    TextField("Kart", value: $team.kart, format: .number)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 60)

                    // Editable team name
                    TextField("Nombre equipo", text: $team.teamName)
                        .textFieldStyle(.roundedBorder)
                } else {
                    // Read-only display
                    Text("K\(team.kart)")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.accentColor)
                        .frame(width: 48, alignment: .leading)

                    Text(team.teamName)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }

                Spacer()

                // Expand toggle
                Button(action: onToggleExpanded) {
                    Image(systemName: isExpanded ? "chevron.up.circle" : "chevron.down.circle")
                        .foregroundColor(.accentColor)
                }
                .buttonStyle(.borderless)

                // Remove (only in edit mode)
                if isEditing {
                    Button(action: onRemove) {
                        Image(systemName: "trash")
                            .foregroundColor(.red)
                    }
                    .buttonStyle(.borderless)
                }
            }

            // Driver summary when collapsed
            if !isExpanded && !team.drivers.isEmpty {
                Text("\(team.drivers.count) piloto\(team.drivers.count == 1 ? "" : "s")")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .padding(.leading, 34)
            }

            // Drivers section
            if isExpanded {
                VStack(spacing: 6) {
                    ForEach($team.drivers) { $driver in
                        DriverRowView(driver: $driver, isEditing: isEditing, onRemove: {
                            team.drivers.removeAll { $0.id == driver.id }
                        })
                    }
                    if isEditing {
                        Button {
                            team.drivers.append(TeamDriver(driverName: "", differentialMs: 0))
                        } label: {
                            Label("Anadir piloto", systemImage: "plus")
                                .font(.system(size: 12))
                        }
                        .buttonStyle(.borderless)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 34)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct DriverRowView: View {
    @Binding var driver: TeamDriver
    let isEditing: Bool
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "person.fill")
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .frame(width: 20)

            if isEditing {
                TextField("Nombre piloto", text: $driver.driverName)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 13))

                // Differential: shown as seconds with ±100ms step
                HStack(spacing: 2) {
                    TextField("0.0", value: Binding(
                        get: { Double(driver.differentialMs) / 1000.0 },
                        set: { driver.differentialMs = Int(($0 * 1000).rounded()) }
                    ), format: .number.precision(.fractionLength(1)))
                        .keyboardType(.numbersAndPunctuation)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 60)
                        .font(.system(size: 12, design: .monospaced))
                    Text("s")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }

                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.red.opacity(0.7))
                }
                .buttonStyle(.borderless)
            } else {
                Text(driver.driverName.isEmpty ? "Sin nombre" : driver.driverName)
                    .font(.system(size: 13))
                    .foregroundColor(.white)

                Spacer()

                if driver.differentialMs != 0 {
                    Text(String(format: "%+.1fs", Double(driver.differentialMs) / 1000.0))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.leading, 14)
    }
}
