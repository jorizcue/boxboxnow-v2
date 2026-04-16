import SwiftUI

/// Recording browser + playback controls for server-side replay.
/// Browse circuits, analyze log files for race-start markers,
/// and start/control replay sessions from the iPad dashboard.
struct ReplayView: View {
    @Environment(AppStore.self) private var app

    @State private var dateFrom: Date = Calendar.current.date(byAdding: .day, value: -7, to: .now) ?? .now
    @State private var dateTo: Date = Date.now

    private var dateFromString: String { Self.dateFormatter.string(from: dateFrom) }
    private var dateToString: String { Self.dateFormatter.string(from: dateTo) }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let displayDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "dd/MM/yyyy"
        return f
    }()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(BBNColors.border)

            if app.race.replayStatus.active {
                ReplayControlsView()
                Divider().overlay(BBNColors.border)
            }

            if app.replay.isLoading {
                ProgressView()
                    .tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if app.replay.circuits.isEmpty {
                PlaceholderView(text: "No hay grabaciones disponibles")
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        dateRangeSection
                        circuitListSection
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task {
            if app.replay.circuits.isEmpty {
                await app.replay.loadRecordings()
            }
        }
        .alert("Error", isPresented: Binding(
            get: { app.replay.lastError != nil },
            set: { if !$0 { app.replay.lastError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(app.replay.lastError ?? "")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Replay de grabaciones")
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Replay")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            if app.race.replayStatus.active {
                Text("EN VIVO")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(BBNColors.accent.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Date Range

    private var dateRangeSection: some View {
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
                .onChange(of: dateFrom) { handleDateChange() }
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
                .onChange(of: dateTo) { handleDateChange() }
            }

            Spacer()
        }
    }

    // MARK: - Circuit List

    private var circuitListSection: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            Text("Grabaciones")
                .font(BBNTypography.title3)
                .foregroundStyle(BBNColors.textPrimary)

            ForEach(app.replay.circuits) { circuit in
                circuitRow(circuit)
            }
        }
    }

    private func circuitRow(_ circuit: RecordingCircuit) -> some View {
        let isSelected = app.replay.selectedCircuitDir == circuit.circuitDir
        let datesInRange = circuit.dates.filter { $0 >= dateFromString && $0 <= dateToString }

        return VStack(alignment: .leading, spacing: 0) {
            BBNCard {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(circuit.circuitName)
                            .font(BBNTypography.bodyBold)
                            .foregroundStyle(BBNColors.textPrimary)
                        Text("\(datesInRange.count) día\(datesInRange.count == 1 ? "" : "s") en rango")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                    }
                    Spacer()
                    Text("\(datesInRange.count)")
                        .font(BBNTypography.bodyBold)
                        .foregroundStyle(BBNColors.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(BBNColors.accent.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    Image(systemName: isSelected ? "chevron.up" : "chevron.down")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if isSelected {
                    app.replay.deselectCircuit()
                } else {
                    Task {
                        await app.replay.selectCircuit(
                            circuit.circuitDir,
                            dateFrom: dateFromString,
                            dateTo: dateToString
                        )
                    }
                }
            }
            .accessibilityLabel("\(circuit.circuitName), \(datesInRange.count) días en rango")
            .accessibilityHint(isSelected ? "Contraer grabaciones" : "Expandir grabaciones")

            if isSelected {
                dayAnalysesSection(circuitDir: circuit.circuitDir)
            }
        }
    }

    // MARK: - Day Analyses

    private func dayAnalysesSection(circuitDir: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(app.replay.dayAnalyses) { day in
                dayRow(day, circuitDir: circuitDir)
            }
        }
        .padding(.leading, 16)
        .padding(.top, 8)
    }

    private func dayRow(_ day: DayAnalysis, circuitDir: String) -> some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(day.date)
                        .font(BBNTypography.bodyBold)
                        .foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    if day.isLoading {
                        ProgressView()
                            .tint(BBNColors.accent)
                            .controlSize(.small)
                    } else if let analysis = day.analysis {
                        Text("\(analysis.raceStarts.count) carrera\(analysis.raceStarts.count == 1 ? "" : "s")")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                    }
                }

                if day.isLoading {
                    Text("Cargando análisis\u{2026}")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                } else if let analysis = day.analysis {
                    if analysis.raceStarts.isEmpty {
                        Text("Sin carreras detectadas")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                    } else {
                        ForEach(analysis.raceStarts) { marker in
                            raceStartRow(marker, filename: day.filename, circuitDir: circuitDir)
                        }
                    }
                }
            }
        }
    }

    private func raceStartRow(_ marker: RaceStartMarker, filename: String, circuitDir: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(marker.title)
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                Text(marker.timestamp)
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
            }
            Spacer()
            Image(systemName: "play.circle.fill")
                .font(.system(size: 24))
                .foregroundStyle(BBNColors.accent)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            Task {
                await app.replay.startReplay(
                    filename: filename,
                    circuitDir: circuitDir,
                    startBlock: marker.block
                )
            }
        }
        .accessibilityLabel("Iniciar replay: \(marker.title)")
    }

    // MARK: - Helpers

    private func handleDateChange() {
        if let dir = app.replay.selectedCircuitDir {
            Task {
                await app.replay.selectCircuit(
                    dir,
                    dateFrom: dateFromString,
                    dateTo: dateToString
                )
            }
        }
    }
}
