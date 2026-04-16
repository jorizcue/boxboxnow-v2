import SwiftUI

/// Kart performance analytics: aggregated stats per kart for a selected
/// circuit and date range, displayed as a card grid.
struct KartAnalyticsView: View {
    @Environment(AppStore.self) private var app

    @State private var dateFrom: Date = Calendar.current.date(byAdding: .day, value: -7, to: .now) ?? .now
    @State private var dateTo: Date = Date.now
    @State private var selectedKart: KartStats?

    private var dateFromString: String { Self.dateFormatter.string(from: dateFrom) }
    private var dateToString: String { Self.dateFormatter.string(from: dateTo) }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(BBNColors.border)

            if app.analytics.isLoading {
                ProgressView()
                    .tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if app.analytics.circuits.isEmpty {
                PlaceholderView(text: "No hay circuitos disponibles")
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        filtersSection
                        statsContent
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
        }
        .onChange(of: app.analytics.selectedCircuitId) { reloadStats() }
        .onChange(of: dateFrom) { reloadStats() }
        .onChange(of: dateTo) { reloadStats() }
        .onChange(of: app.analytics.filterOutliers) { reloadStats() }
        .sheet(item: $selectedKart) { kart in
            KartAnalyticsDetailSheet(
                kart: kart,
                circuitId: app.analytics.selectedCircuitId ?? 0,
                dateFrom: dateFromString,
                dateTo: dateToString
            )
            .environment(app)
        }
        .alert("Error", isPresented: Binding(
            get: { app.analytics.lastError != nil },
            set: { if !$0 { app.analytics.lastError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(app.analytics.lastError ?? "")
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Karts")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
            Button {
                reloadStats()
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
        VStack(alignment: .leading, spacing: 12) {
            // Circuit picker
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Circuito")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                    Menu {
                        ForEach(app.analytics.circuits) { circuit in
                            Button(circuit.name) {
                                app.analytics.selectedCircuitId = circuit.id
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

            // Date range + outlier toggle
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Desde")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                    DatePicker(
                        "",
                        selection: $dateFrom,
                        displayedComponents: .date
                    )
                    .labelsHidden()
                    .tint(BBNColors.accent)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Hasta")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                    DatePicker(
                        "",
                        selection: $dateTo,
                        displayedComponents: .date
                    )
                    .labelsHidden()
                    .tint(BBNColors.accent)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Filtrar atipicos")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                    @Bindable var analytics = app.analytics
                    Toggle("", isOn: $analytics.filterOutliers)
                        .labelsHidden()
                        .tint(BBNColors.accent)
                }

                Spacer()
            }
        }
    }

    // MARK: - Stats Content

    @ViewBuilder
    private var statsContent: some View {
        if app.analytics.selectedCircuitId == nil {
            PlaceholderView(text: "Selecciona un circuito")
        } else if app.analytics.kartStats.isEmpty {
            PlaceholderView(text: "Sin datos de analytics")
        } else {
            kartGrid
        }
    }

    // MARK: - Kart Grid

    private var kartGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 16)], spacing: 16) {
            ForEach(app.analytics.kartStats) { kart in
                kartCard(kart)
                    .onTapGesture { selectedKart = kart }
            }
        }
    }

    private func kartCard(_ kart: KartStats) -> some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    KartNumberBadge(number: kart.kartNumber, size: 48)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(kart.races) carreras")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                        Text("\(kart.validLaps) vueltas")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    statRow(label: "Mejor vuelta", value: RaceFormatters.lapTime(ms: Double(kart.bestLapMs)))
                    statRow(label: "Top 5 prom.", value: RaceFormatters.lapTime(ms: kart.best5AvgMs))
                    statRow(label: "Promedio", value: RaceFormatters.lapTime(ms: kart.avgLapMs))
                }

                if !kart.teams.isEmpty {
                    Text(kart.teams.joined(separator: ", "))
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                        .lineLimit(2)
                }
            }
        }
        .contentShape(Rectangle())
    }

    private func statRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            Spacer()
            Text(value)
                .font(BBNTypography.bodyBold)
                .foregroundStyle(BBNColors.textPrimary)
                .monospacedDigit()
        }
    }

    // MARK: - Helpers

    private var selectedCircuitName: String {
        if let id = app.analytics.selectedCircuitId,
           let circuit = app.analytics.circuits.first(where: { $0.id == id }) {
            return circuit.name
        }
        return "Seleccionar..."
    }

    private func reloadStats() {
        guard let circuitId = app.analytics.selectedCircuitId else { return }
        Task {
            await app.analytics.loadStats(
                circuitId: circuitId,
                dateFrom: dateFromString,
                dateTo: dateToString
            )
        }
    }
}
