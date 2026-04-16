import SwiftUI

/// GPS Insights dashboard — browse laps, view aggregated stats, and inspect
/// individual lap trajectory, speed trace, and G-force scatter.
struct InsightsView: View {
    @Environment(AppStore.self) private var app

    @State private var selectedCircuitId: Int?
    @State private var selectedLapId: Int?

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
            selectedLapId = nil
            Task { await app.insights.loadData(circuitId: selectedCircuitId) }
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
                Text("Vueltas")
                    .font(BBNTypography.title3)
                    .foregroundStyle(BBNColors.textPrimary)

                LazyVStack(spacing: 8) {
                    ForEach(app.insights.laps) { lap in
                        lapRow(lap)
                            .onTapGesture {
                                selectedLapId = lap.id
                                Task { await app.insights.loadLapDetail(lapId: lap.id) }
                            }
                    }
                }
            }
        }
    }

    private func lapRow(_ lap: GPSLapSummary) -> some View {
        let isSelected = selectedLapId == lap.id
        return BBNCard {
            HStack(spacing: 12) {
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
                    Text(RaceFormatters.lapTime(ms: lap.durationMs))
                        .font(BBNTypography.bodyBold)
                        .foregroundStyle(BBNColors.textPrimary)
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
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? BBNColors.accent : Color.clear, lineWidth: 1.5)
        )
        .contentShape(Rectangle())
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
            VStack(alignment: .leading, spacing: 16) {
                Text("Vuelta \(detail.lapNumber) — Detalle")
                    .font(BBNTypography.title3)
                    .foregroundStyle(BBNColors.textPrimary)

                TrajectoryMapView(
                    positions: detail.positions ?? [],
                    speeds: detail.speeds
                )

                SpeedTraceView(
                    distances: detail.distances ?? [],
                    speeds: detail.speeds ?? []
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
