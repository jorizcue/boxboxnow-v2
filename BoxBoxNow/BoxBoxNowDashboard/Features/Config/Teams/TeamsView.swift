import SwiftUI

/// Single-view bulk editor for the active session's team positions.
/// Mirrors the web `TeamEditor.tsx` flow but without drag-and-drop: users
/// reorder via move-up/move-down controls, and the whole list is saved with
/// one PUT that replaces the server-side list entirely.
///
/// There is no session picker because the backend keeps one active session
/// per user; when none exists the view shows a "create a session first"
/// placeholder.
struct TeamsView: View {
    @Environment(AppStore.self) private var app

    @State private var draft: [Team] = []
    @State private var expanded: Set<UUID> = []
    @State private var saving: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await loadFromServer() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Editor de equipos")
    }

    // MARK: - Sections

    private var header: some View {
        HStack(spacing: 12) {
            Text("Equipos")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
            Button {
                addTeam()
            } label: {
                Label("Añadir equipo", systemImage: "plus")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.accent)
            }
            .disabled(app.config.activeSession == nil)
            .accessibilityHint("Añade un nuevo equipo al final de la lista")

            BBNPrimaryButton(title: "Guardar equipos", isLoading: saving) {
                Task { await save() }
            }
            .frame(maxWidth: 220)
            .disabled(saving || app.config.activeSession == nil)
            .accessibilityHint("Reemplaza la lista completa de equipos en el servidor")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private var content: some View {
        if app.config.activeSession == nil && !app.config.isLoadingSession {
            PlaceholderView(text: "Crea una sesión activa antes de gestionar equipos")
        } else if app.config.isLoadingTeams && draft.isEmpty {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if draft.isEmpty {
            PlaceholderView(text: "Sin equipos — pulsa “Añadir equipo”")
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach($draft) { $team in
                        teamCard(team: $team)
                    }
                }
                .padding(20)
            }
        }
    }

    // MARK: - Team card

    @ViewBuilder
    private func teamCard(team: Binding<Team>) -> some View {
        // Positions are always renumbered to match array-index + 1 after any
        // mutation, so deriving the zero-based index from position is safe.
        let index = team.wrappedValue.position - 1
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                teamHeader(index: index, team: team)
                if expanded.contains(team.wrappedValue.id) {
                    driversSection(team: team)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(teamA11yLabel(team.wrappedValue))
    }

    private func teamHeader(index: Int, team: Binding<Team>) -> some View {
        let teamValue = team.wrappedValue
        return HStack(spacing: 10) {
            Text("\(teamValue.position)")
                .font(BBNTypography.title3)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 36, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                Text("Kart")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                Stepper(value: team.kart, in: 0...999) {
                    Text("\(teamValue.kart)")
                        .font(BBNTypography.title3)
                        .monospacedDigit()
                        .foregroundStyle(BBNColors.accent)
                }
                .labelsHidden()
            }
            .frame(width: 140)

            VStack(alignment: .leading, spacing: 2) {
                Text("Nombre del equipo")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                TextField("Nombre", text: team.teamName)
                    .textFieldStyle(.roundedBorder)
                    .font(BBNTypography.body)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 6) {
                Button {
                    moveUp(index)
                } label: {
                    Image(systemName: "arrow.up")
                }
                .disabled(index == 0)
                .accessibilityLabel("Subir equipo")
                .accessibilityHint(index > 0 ? "Mueve a la posición \(index)" : "")

                Button {
                    moveDown(index)
                } label: {
                    Image(systemName: "arrow.down")
                }
                .disabled(index == draft.count - 1)
                .accessibilityLabel("Bajar equipo")
                .accessibilityHint(index < draft.count - 1 ? "Mueve a la posición \(index + 2)" : "")
            }
            .font(BBNTypography.body)
            .foregroundStyle(BBNColors.accent)

            Button {
                toggleExpand(teamValue.id)
            } label: {
                Image(systemName: expanded.contains(teamValue.id) ? "chevron.up" : "chevron.down")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textMuted)
            }
            .accessibilityLabel(expanded.contains(teamValue.id) ? "Ocultar pilotos" : "Mostrar pilotos")
            .accessibilityHint(teamValue.drivers.count == 1 ? "1 piloto" : "\(teamValue.drivers.count) pilotos")

            Button {
                removeTeam(id: teamValue.id)
            } label: {
                Image(systemName: "trash")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.danger)
            }
            .accessibilityLabel("Eliminar equipo")
        }
    }

    private func driversSection(team: Binding<Team>) -> some View {
        let teamId = team.wrappedValue.id
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Pilotos")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                Spacer()
                Button {
                    addDriver(teamId: teamId)
                } label: {
                    Label("Añadir piloto", systemImage: "plus")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.accent)
                }
            }

            if team.wrappedValue.drivers.isEmpty {
                Text("Sin pilotos")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
            } else {
                ForEach(team.drivers) { $driver in
                    driverRow(driver: $driver, teamId: teamId)
                }
            }
        }
        .padding(.top, 4)
    }

    private func driverRow(driver: Binding<TeamDriver>, teamId: UUID) -> some View {
        let driverValue = driver.wrappedValue
        return HStack(spacing: 10) {
            TextField("Nombre del piloto", text: driver.driverName)
                .textFieldStyle(.roundedBorder)
                .font(BBNTypography.body)

            Stepper(value: driver.differentialMs,
                    in: -60_000...60_000,
                    step: 100) {
                Text("\(driverValue.differentialMs) ms")
                    .font(BBNTypography.body)
                    .monospacedDigit()
                    .foregroundStyle(driverDiffColor(driverValue.differentialMs))
                    .frame(minWidth: 90, alignment: .trailing)
            }
            .labelsHidden()
            .frame(width: 200)

            Button {
                removeDriver(teamId: teamId, driverId: driverValue.id)
            } label: {
                Image(systemName: "minus.circle.fill")
                    .foregroundStyle(BBNColors.danger)
            }
            .accessibilityLabel("Eliminar piloto")
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(driverA11yLabel(driverValue))
    }

    private func driverDiffColor(_ ms: Int) -> Color {
        if ms < 0 { return BBNColors.accent }
        if ms > 0 { return BBNColors.danger }
        return BBNColors.textMuted
    }

    // MARK: - Accessibility helpers

    private func teamA11yLabel(_ team: Team) -> String {
        var parts: [String] = []
        parts.append("Equipo posición \(team.position)")
        parts.append("nombre \(team.teamName.isEmpty ? "—" : team.teamName)")
        parts.append("kart \(team.kart == 0 ? "sin asignar" : "\(team.kart)")")
        parts.append(team.drivers.count == 1 ? "1 piloto" : "\(team.drivers.count) pilotos")
        return parts.joined(separator: ", ")
    }

    private func driverA11yLabel(_ driver: TeamDriver) -> String {
        var parts: [String] = []
        parts.append("Piloto \(driver.driverName.isEmpty ? "—" : driver.driverName)")
        parts.append("diferencial \(driver.differentialMs) milisegundos")
        return parts.joined(separator: ", ")
    }

    // MARK: - Mutations

    private func addTeam() {
        let team = Team(position: draft.count + 1, kart: 0, teamName: "", drivers: [])
        draft.append(team)
        expanded.insert(team.id)
        renumber()
    }

    private func removeTeam(id: UUID) {
        guard let index = draft.firstIndex(where: { $0.id == id }) else { return }
        draft.remove(at: index)
        expanded.remove(id)
        renumber()
    }

    private func moveUp(_ index: Int) {
        guard index > 0 else { return }
        draft.swapAt(index, index - 1)
        renumber()
    }

    private func moveDown(_ index: Int) {
        guard index < draft.count - 1 else { return }
        draft.swapAt(index, index + 1)
        renumber()
    }

    private func toggleExpand(_ id: UUID) {
        if expanded.contains(id) {
            expanded.remove(id)
        } else {
            expanded.insert(id)
        }
    }

    private func addDriver(teamId: UUID) {
        guard let index = draft.firstIndex(where: { $0.id == teamId }) else { return }
        draft[index].drivers.append(TeamDriver(driverName: "", differentialMs: 0))
    }

    private func removeDriver(teamId: UUID, driverId: UUID) {
        guard let teamIndex = draft.firstIndex(where: { $0.id == teamId }) else { return }
        guard let driverIndex = draft[teamIndex].drivers.firstIndex(where: { $0.id == driverId }) else { return }
        draft[teamIndex].drivers.remove(at: driverIndex)
    }

    /// Keep `position` fields aligned with array index after any mutation so
    /// the server receives a contiguous 1..N sequence on save.
    private func renumber() {
        for i in draft.indices {
            draft[i].position = i + 1
        }
    }

    // MARK: - IO

    private func loadFromServer() async {
        // The active session must be loaded before we can fetch teams — the
        // server resolves "active session" implicitly and 404s if there is
        // none. Defer to the sibling Sessions sub-tab's source of truth.
        if app.config.activeSession == nil {
            await app.config.reloadActiveSession()
        }
        guard app.config.activeSession != nil else {
            draft = []
            expanded = []
            return
        }
        await app.config.reloadTeams()
        draft = app.config.teams
        expanded = []
        renumber()
    }

    private func save() async {
        guard app.config.activeSession != nil else { return }
        saving = true
        defer { saving = false }
        renumber()

        // Server returns new UUIDs on every decode, so `expanded: Set<UUID>` goes
        // stale after `draft = app.config.teams`. Capture the positions of the
        // expanded cards now, then re-anchor expansion to the new UUIDs at the
        // matching positions — the server preserves insertion order, so position
        // is a stable bridge across the round-trip.
        let expandedPositions: Set<Int> = Set(
            draft.compactMap { expanded.contains($0.id) ? $0.position : nil }
        )

        if await app.config.saveTeams(draft) {
            draft = app.config.teams
            renumber()
            expanded = Set(
                draft.compactMap { expandedPositions.contains($0.position) ? $0.id : nil }
            )
        }
    }
}
