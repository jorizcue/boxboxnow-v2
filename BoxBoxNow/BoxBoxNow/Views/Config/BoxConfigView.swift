import SwiftUI

/// Box configuration: teams + drivers management (mirrors web TeamEditor).
/// - Auto-load toggle (persists on /config/session.auto_load_teams)
/// - Load from live timing
/// - Add / remove / reorder teams
/// - Per team: kart number, team name, driver list
/// - Per driver: name, differential_ms (seconds step)
struct BoxConfigView: View {
    @EnvironmentObject var toast: ToastManager

    @State private var teams: [Team] = []
    @State private var autoLoad: Bool = false
    @State private var expandedTeamIds: Set<UUID> = []
    @State private var loading = true
    @State private var saving = false
    @State private var importing = false

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
                    addTeam()
                } label: {
                    Label("Añadir equipo", systemImage: "plus.circle")
                }

                Button {
                    Task { await saveTeams() }
                } label: {
                    HStack {
                        if saving {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Image(systemName: "square.and.arrow.down")
                        }
                        Text("Guardar cambios")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(.accentColor)
                }
                .disabled(saving)
            }

            // ── Team list ──
            if teams.isEmpty && !loading {
                Section {
                    Text("No hay equipos. Cárgalos desde Live Timing o añádelos manualmente.")
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
                            onToggleExpanded: { toggleExpanded(team.id) },
                            onRemove: { removeTeam(team.id) }
                        )
                    }
                    .onMove(perform: moveTeam)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Configuración Box")
        .toolbar {
            EditButton()
        }
        .overlay {
            if loading {
                ProgressView()
            }
        }
        .task {
            await loadAll()
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
        // auto_load_teams is not in RaceSession model — read raw dict directly
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

    private func importFromLive() async {
        importing = true
        defer { importing = false }
        do {
            let live = try await APIClient.shared.getLiveTeams()
            await MainActor.run {
                // Merge by kart: existing drivers kept; new live karts appended
                var byKart: [Int: Team] = Dictionary(uniqueKeysWithValues: teams.map { ($0.kart, $0) })
                for liveTeam in live.teams {
                    if var existing = byKart[liveTeam.kart] {
                        existing.teamName = liveTeam.teamName.isEmpty ? existing.teamName : liveTeam.teamName
                        let existingNames = Set(existing.drivers.map { $0.driverName })
                        for d in liveTeam.drivers where !existingNames.contains(d.driverName) && !d.driverName.isEmpty {
                            existing.drivers.append(TeamDriver(driverName: d.driverName, differentialMs: 0))
                        }
                        byKart[liveTeam.kart] = existing
                    } else {
                        byKart[liveTeam.kart] = Team(
                            position: teams.count + byKart.count,
                            kart: liveTeam.kart,
                            teamName: liveTeam.teamName,
                            drivers: liveTeam.drivers.map { TeamDriver(driverName: $0.driverName, differentialMs: 0) }
                        )
                    }
                }
                let merged = byKart.values.sorted { $0.kart < $1.kart }
                self.teams = merged.enumerated().map { idx, t in
                    var copy = t
                    copy.position = idx + 1
                    return copy
                }
                toast.success("Importados \(live.kartCount) karts")
            }
        } catch {
            await MainActor.run { toast.warning("No se pudo cargar Live Timing") }
        }
    }

    private func saveTeams() async {
        saving = true
        defer { saving = false }
        // Recalculate positions from current order
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

    private func addTeam() {
        let nextKart = (teams.map { $0.kart }.max() ?? 0) + 1
        let t = Team(position: teams.count + 1, kart: nextKart, teamName: "Equipo \(teams.count + 1)", drivers: [])
        teams.append(t)
        expandedTeamIds.insert(t.id)
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

                // Kart number
                TextField("Kart", value: $team.kart, format: .number)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 60)

                // Team name
                TextField("Nombre equipo", text: $team.teamName)
                    .textFieldStyle(.roundedBorder)

                // Expand toggle
                Button(action: onToggleExpanded) {
                    Image(systemName: isExpanded ? "chevron.up.circle" : "chevron.down.circle")
                        .foregroundColor(.accentColor)
                }
                .buttonStyle(.borderless)

                // Remove
                Button(action: onRemove) {
                    Image(systemName: "trash")
                        .foregroundColor(.red)
                }
                .buttonStyle(.borderless)
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
                        DriverRowView(driver: $driver, onRemove: {
                            team.drivers.removeAll { $0.id == driver.id }
                        })
                    }
                    Button {
                        team.drivers.append(TeamDriver(driverName: "", differentialMs: 0))
                    } label: {
                        Label("Añadir piloto", systemImage: "plus")
                            .font(.system(size: 12))
                    }
                    .buttonStyle(.borderless)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 34)
                }
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct DriverRowView: View {
    @Binding var driver: TeamDriver
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "person.fill")
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .frame(width: 20)

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
        }
        .padding(.leading, 14)
    }
}
