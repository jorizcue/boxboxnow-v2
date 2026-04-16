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
                    ForEach(Array(draft.enumerated()), id: \.element.id) { idx, team in
                        teamCard(index: idx, team: team)
                    }
                }
                .padding(20)
            }
        }
    }

    // MARK: - Team card

    @ViewBuilder
    private func teamCard(index: Int, team: Team) -> some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                teamHeader(index: index, team: team)
                if expanded.contains(team.id) {
                    driversSection(teamIndex: index, team: team)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Equipo posición \(team.position), nombre \(team.teamName.isEmpty ? "sin nombre" : team.teamName), kart \(team.kart)")
    }

    private func teamHeader(index: Int, team: Team) -> some View {
        HStack(spacing: 10) {
            Text("\(team.position)")
                .font(BBNTypography.title3)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 36, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                Text("Kart")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                Stepper(value: kartBinding(index), in: 0...999) {
                    Text("\(team.kart)")
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
                TextField("Nombre", text: nameBinding(index))
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

                Button {
                    moveDown(index)
                } label: {
                    Image(systemName: "arrow.down")
                }
                .disabled(index == draft.count - 1)
                .accessibilityLabel("Bajar equipo")
            }
            .font(BBNTypography.body)
            .foregroundStyle(BBNColors.accent)

            Button {
                toggleExpand(team.id)
            } label: {
                Image(systemName: expanded.contains(team.id) ? "chevron.up" : "chevron.down")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textMuted)
            }
            .accessibilityLabel(expanded.contains(team.id) ? "Ocultar pilotos" : "Mostrar pilotos")
            .accessibilityHint("\(team.drivers.count) pilotos")

            Button {
                removeTeam(at: index)
            } label: {
                Image(systemName: "trash")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.danger)
            }
            .accessibilityLabel("Eliminar equipo")
        }
    }

    private func driversSection(teamIndex: Int, team: Team) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Pilotos")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                Spacer()
                Button {
                    addDriver(teamIndex: teamIndex)
                } label: {
                    Label("Añadir piloto", systemImage: "plus")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.accent)
                }
            }

            if team.drivers.isEmpty {
                Text("Sin pilotos")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
            } else {
                ForEach(Array(team.drivers.enumerated()), id: \.element.id) { driverIdx, driver in
                    driverRow(teamIndex: teamIndex, driverIndex: driverIdx, driver: driver)
                }
            }
        }
        .padding(.top, 4)
    }

    private func driverRow(teamIndex: Int, driverIndex: Int, driver: TeamDriver) -> some View {
        HStack(spacing: 10) {
            TextField("Nombre del piloto",
                      text: driverNameBinding(teamIndex: teamIndex, driverIndex: driverIndex))
                .textFieldStyle(.roundedBorder)
                .font(BBNTypography.body)

            Stepper(value: driverDiffBinding(teamIndex: teamIndex, driverIndex: driverIndex),
                    in: -60_000...60_000,
                    step: 100) {
                Text("\(driver.differentialMs) ms")
                    .font(BBNTypography.body)
                    .monospacedDigit()
                    .foregroundStyle(driverDiffColor(driver.differentialMs))
                    .frame(minWidth: 90, alignment: .trailing)
            }
            .labelsHidden()
            .frame(width: 200)

            Button {
                removeDriver(teamIndex: teamIndex, driverIndex: driverIndex)
            } label: {
                Image(systemName: "minus.circle.fill")
                    .foregroundStyle(BBNColors.danger)
            }
            .accessibilityLabel("Eliminar piloto")
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Piloto \(driver.driverName.isEmpty ? "sin nombre" : driver.driverName), diferencial \(driver.differentialMs) milisegundos")
    }

    private func driverDiffColor(_ ms: Int) -> Color {
        if ms < 0 { return BBNColors.accent }
        if ms > 0 { return BBNColors.danger }
        return BBNColors.textMuted
    }

    // MARK: - Bindings

    private func kartBinding(_ index: Int) -> Binding<Int> {
        Binding(
            get: { draft[index].kart },
            set: { draft[index].kart = $0 }
        )
    }

    private func nameBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { draft[index].teamName },
            set: { draft[index].teamName = $0 }
        )
    }

    private func driverNameBinding(teamIndex: Int, driverIndex: Int) -> Binding<String> {
        Binding(
            get: { draft[teamIndex].drivers[driverIndex].driverName },
            set: { draft[teamIndex].drivers[driverIndex].driverName = $0 }
        )
    }

    private func driverDiffBinding(teamIndex: Int, driverIndex: Int) -> Binding<Int> {
        Binding(
            get: { draft[teamIndex].drivers[driverIndex].differentialMs },
            set: { draft[teamIndex].drivers[driverIndex].differentialMs = $0 }
        )
    }

    // MARK: - Mutations

    private func addTeam() {
        let nextPosition = (draft.map(\.position).max() ?? 0) + 1
        let team = Team(position: nextPosition, kart: 0, teamName: "", drivers: [])
        draft.append(team)
        expanded.insert(team.id)
        renumber()
    }

    private func removeTeam(at index: Int) {
        let id = draft[index].id
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

    private func addDriver(teamIndex: Int) {
        draft[teamIndex].drivers.append(TeamDriver(driverName: "", differentialMs: 0))
    }

    private func removeDriver(teamIndex: Int, driverIndex: Int) {
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
        guard app.config.activeSession != nil else { return }
        await app.config.reloadTeams()
        draft = app.config.teams
        renumber()
    }

    private func save() async {
        guard app.config.activeSession != nil else { return }
        saving = true
        defer { saving = false }
        renumber()
        if await app.config.saveTeams(draft) {
            draft = app.config.teams
            renumber()
        }
    }
}
