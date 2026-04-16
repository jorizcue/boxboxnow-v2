import SwiftUI

/// GPS Insights dashboard — browse laps, view aggregated stats, and inspect
/// individual lap trajectory, speed trace, and G-force scatter.
struct InsightsView: View {
    @Environment(AppStore.self) private var app

    @State private var selectedCircuitId: Int?
    @State private var selectedLapId: Int?

    /// Compare-mode: up to 2 lap IDs the user has ticked. When both are set
    /// the detail section renders an overlay of both speed traces.
    @State private var compareSelection: Set<Int> = []
    @State private var confirmDeleteLapId: Int?

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(BBNColors.border)

            if app.insights.isLoading && app.insights.laps.isEmpty {
                ProgressView()
                    .tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        filtersSection
                        statsRow
                        lapListSection
                        detailSection
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task {
            if app.analytics.circuits.isEmpty {
                await app.analytics.loadCircuits()
            }
            await app.insights.loadData(circuitId: selectedCircuitId)
        }
        .onChange(of: selectedCircuitId) {
            app.insights.selectedLapDetail = nil
            app.insights.clearCompareLap()
            selectedLapId = nil
            compareSelection = []
            Task { await app.insights.loadData(circuitId: selectedCircuitId) }
        }
        .alert("Eliminar vuelta",
               isPresented: Binding(
                 get: { confirmDeleteLapId != nil },
                 set: { if !$0 { confirmDeleteLapId = nil } }
               )) {
            Button("Cancelar", role: .cancel) { confirmDeleteLapId = nil }
            Button("Eliminar", role: .destructive) {
                if let id = confirmDeleteLapId {
                    Task {
                        _ = await app.insights.deleteLap(lapId: id)
                        if selectedLapId == id { selectedLapId = nil }
                        compareSelection.remove(id)
                    }
                }
                confirmDeleteLapId = nil
            }
        } message: {
            Text("Esta accion no se puede deshacer.")
        }
        .alert("Error", isPresented: Binding(
            get: { app.insights.lastError != nil },
            set: { if !$0 { app.insights.lastError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(app.insights.lastError ?? "")
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("GPS Insights")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
            Button {
                Task { await app.insights.loadData(circuitId: selectedCircuitId) }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.accent)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Filters

    private var filtersSection: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Circuito")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
                Menu {
                    Button("Todos") { selectedCircuitId = nil }
                    ForEach(app.analytics.circuits) { circuit in
                        Button(circuit.name) {
                            selectedCircuitId = circuit.id
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(selectedCircuitName)
                            .font(BBNTypography.body)
                            .foregroundStyle(BBNColors.textPrimary)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(BBNColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(BBNColors.border, lineWidth: 1)
                    )
                }
            }
            Spacer()
        }
    }

    // MARK: - Stats Row

    @ViewBuilder
    private var statsRow: some View {
        if let stats = app.insights.stats {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    statCard(title: "Vueltas", value: "\(stats.totalLaps)")
                    statCard(title: "Mejor vuelta", value: RaceFormatters.lapTime(ms: stats.bestLapMs))
                    statCard(title: "Promedio", value: RaceFormatters.lapTime(ms: stats.avgLapMs))
                    statCard(title: "Vel. max", value: formatSpeed(stats.topSpeedKmh))
                    statCard(title: "Distancia total", value: formatDistance(stats.totalDistanceKm))
                }
            }
        }
    }

    private func statCard(title: String, value: String) -> some View {
        BBNCard {
            VStack(spacing: 4) {
                Text(title)
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
                Text(value)
                    .font(BBNTypography.bodyBold)
                    .foregroundStyle(BBNColors.textPrimary)
                    .monospacedDigit()
            }
            .frame(minWidth: 100)
        }
    }

    // MARK: - Lap List

    @ViewBuilder
    private var lapListSection: some View {
        if app.insights.laps.isEmpty && !app.insights.isLoading {
            PlaceholderView(text: "Sin vueltas GPS registradas")
                .frame(minHeight: 120)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Vueltas")
                        .font(BBNTypography.title3)
                        .foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    if !compareSelection.isEmpty {
                        Text(compareSelection.count == 2 ? "Comparando 2 vueltas" : "Marca otra vuelta para comparar")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.accent)
                        Button { compareSelection = []; app.insights.clearCompareLap() } label: {
                            Text("Limpiar")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(BBNColors.textMuted)
                        }.buttonStyle(.plain)
                    }
                }

                LazyVStack(spacing: 6) {
                    ForEach(app.insights.laps) { lap in
                        lapRow(lap)
                    }
                }
            }
        }
    }

    private func lapRow(_ lap: GPSLapSummary) -> some View {
        let isSelected = selectedLapId == lap.id
        let isCompared = compareSelection.contains(lap.id)
        return HStack(spacing: 12) {
            // Compare checkbox (max 2)
            Button { toggleCompare(lap) } label: {
                Image(systemName: isCompared ? "checkmark.square.fill" : "square")
                    .font(.system(size: 16))
                    .foregroundStyle(isCompared ? BBNColors.accent : BBNColors.textDim)
                    .frame(width: 22)
            }.buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text("Vuelta \(lap.lapNumber)")
                    .font(BBNTypography.bodyBold)
                    .foregroundStyle(BBNColors.textPrimary)
                if let date = lap.recordedAt {
                    Text(formatDate(date))
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                // Lap time color-coded relative to best + avg of the dataset.
                Text(RaceFormatters.lapTime(ms: lap.durationMs))
                    .font(BBNTypography.bodyBold)
                    .foregroundStyle(lapTimeColor(lap.durationMs))
                    .monospacedDigit()
                Text(String(format: "%.0f m", lap.totalDistanceM))
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
                    .monospacedDigit()
            }

            if let speed = lap.maxSpeedKmh {
                Text(String(format: "%.1f km/h", speed))
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                    .monospacedDigit()
                    .frame(width: 90, alignment: .trailing)
            }

            if let source = lap.gpsSource {
                Text(source)
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(BBNColors.accent.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            // Inspect trigger — keeps the checkbox from also selecting.
            Button {
                selectedLapId = lap.id
                Task { await app.insights.loadLapDetail(lapId: lap.id) }
            } label: {
                Image(systemName: "eye")
                    .font(.system(size: 14))
                    .foregroundStyle(BBNColors.textMuted)
            }.buttonStyle(.plain)

            Button {
                confirmDeleteLapId = lap.id
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14))
                    .foregroundStyle(BBNColors.danger.opacity(0.7))
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(BBNColors.card)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? BBNColors.accent : (isCompared ? BBNColors.accent.opacity(0.5) : Color.clear),
                        lineWidth: 1.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    /// Tier color by rank: fastest 25% green, middle grey, slowest 25% red.
    /// Same spirit as the web's `lap-time speed tier` formatting.
    private func lapTimeColor(_ ms: Double) -> Color {
        guard ms > 0 else { return BBNColors.textDim }
        let valids = app.insights.laps.map { $0.durationMs }.filter { $0 > 0 }.sorted()
        guard valids.count >= 4 else { return BBNColors.textPrimary }
        let q1 = valids[valids.count / 4]
        let q3 = valids[3 * valids.count / 4]
        if ms <= q1 { return BBNColors.accent }
        if ms >= q3 { return BBNColors.danger }
        return BBNColors.textPrimary
    }

    private func toggleCompare(_ lap: GPSLapSummary) {
        if compareSelection.contains(lap.id) {
            compareSelection.remove(lap.id)
            if app.insights.compareLapDetail?.id == lap.id {
                app.insights.clearCompareLap()
            }
        } else {
            if compareSelection.count >= 2 {
                // Pin it down to 2: drop the older one (deterministic: any element)
                if let drop = compareSelection.first { compareSelection.remove(drop) }
            }
            compareSelection.insert(lap.id)
            // Load whichever side isn't the primary-selected one so the
            // overlay has a second trace ready.
            if selectedLapId == nil {
                selectedLapId = lap.id
                Task { await app.insights.loadLapDetail(lapId: lap.id) }
            } else if compareSelection.count == 2 {
                let other = compareSelection.first { $0 != selectedLapId } ?? lap.id
                Task { await app.insights.loadCompareLapDetail(lapId: other) }
            }
        }
    }

    // MARK: - Detail Section

    @ViewBuilder
    private var detailSection: some View {
        if app.insights.isLoadingDetail {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
        } else if let detail = app.insights.selectedLapDetail {
            let compare = app.insights.compareLapDetail
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Vuelta \(detail.lapNumber) — Detalle")
                        .font(BBNTypography.title3)
                        .foregroundStyle(BBNColors.textPrimary)
                    if let c = compare {
                        Text("vs Vuelta \(c.lapNumber)")
                            .font(BBNTypography.caption)
                            .foregroundStyle(Color(bbnHex: 0x06b6d4))
                    }
                    Spacer()
                }

                TrajectoryMapView(
                    positions: detail.positions ?? [],
                    speeds: detail.speeds
                )

                SpeedTraceView(
                    distances: detail.distances ?? [],
                    speeds: detail.speeds ?? [],
                    compareDistances: compare?.distances ?? [],
                    compareSpeeds: compare?.speeds ?? [],
                    primaryLabel: "Vuelta \(detail.lapNumber)",
                    compareLabel: compare.map { "Vuelta \($0.lapNumber)" } ?? ""
                )

                GForceScatterView(
                    gforceLat: detail.gforceLat ?? [],
                    gforceLon: detail.gforceLon ?? []
                )
            }
        }
    }

    // MARK: - Helpers

    private var selectedCircuitName: String {
        if let id = selectedCircuitId,
           let circuit = app.analytics.circuits.first(where: { $0.id == id }) {
            return circuit.name
        }
        return "Todos"
    }

    private func formatSpeed(_ kmh: Double?) -> String {
        guard let kmh else { return "—" }
        return String(format: "%.1f km/h", kmh)
    }

    private func formatDistance(_ km: Double) -> String {
        String(format: "%.1f km", km)
    }

    /// Best-effort date formatting from ISO 8601 string.
    private func formatDate(_ iso: String) -> String {
        let trimmed = String(iso.prefix(10))  // "2025-04-10"
        guard trimmed.count == 10 else { return iso }
        // Reformat to dd/MM/yyyy for Spanish locale
        let parts = trimmed.split(separator: "-")
        guard parts.count == 3 else { return trimmed }
        return "\(parts[2])/\(parts[1])/\(parts[0])"
    }
}
