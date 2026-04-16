import SwiftUI

/// Recording browser + playback controls for server-side replay.
/// Browse circuits, analyze log files for race-start markers,
/// and start/control replay sessions from the iPad dashboard.
struct ReplayView: View {
    @Environment(AppStore.self) private var app

    @State private var dateFrom: Date = Calendar.current.date(byAdding: .day, value: -7, to: .now) ?? .now
    @State private var dateTo: Date = Date.now

    /// Sheet payload for the race-start "Play" modal. Set when the user
    /// taps a race marker; cleared on Play or Cancel.
    @State private var modalSelection: RaceStartSelection?

    private struct RaceStartSelection: Identifiable {
        let id = UUID()
        let marker: RaceStartMarker
        let filename: String
        let circuitDir: String
        let date: String
    }

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
        .sheet(item: $modalSelection) { sel in
            raceStartModal(for: sel)
        }
    }

    /// Session modal shown when the user taps a race-start marker. Matches
    /// the web's "Comenzar desde" modal: shows circuit / date / title and
    /// gives a big Play button. Admins would also see Download here in the
    /// web; we omit it for now because the download API isn't exposed on
    /// the iPad service layer yet.
    private func raceStartModal(for sel: RaceStartSelection) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(sel.marker.title)
                    .font(BBNTypography.title2)
                    .foregroundStyle(BBNColors.textPrimary)
                Text("\(sel.date) · bloque \(sel.marker.block)")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
                Text(sel.marker.timestamp)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(BBNColors.textDim)
            }
            .padding(.top, 24)
            .padding(.horizontal, 20)

            Spacer()

            HStack(spacing: 12) {
                Button {
                    modalSelection = nil
                } label: {
                    Text("Cancelar")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(BBNColors.textMuted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(BBNColors.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)

                Button {
                    Task {
                        await app.replay.startReplay(
                            filename: sel.filename,
                            circuitDir: sel.circuitDir,
                            startBlock: sel.marker.block
                        )
                        modalSelection = nil
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill")
                        Text("Iniciar replay").font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(Color.black)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(BBNColors.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .frame(minWidth: 420, minHeight: 220)
        .background(BBNColors.background)
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
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Text(day.date)
                        .font(BBNTypography.bodyBold)
                        .foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    if day.isLoading {
                        ProgressView()
                            .tint(BBNColors.accent)
                            .controlSize(.small)
                    } else if let analysis = day.analysis {
                        // Block count + end time, matching web per-day header
                        Text("\(analysis.totalBlocks) bloques")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                        if let endTime = analysis.endTime {
                            Text("fin \(Self.timeOnly(endTime))")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(BBNColors.textDim)
                        }
                        Text("\(analysis.raceStarts.count) carrera\(analysis.raceStarts.count == 1 ? "" : "s")")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.accent)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(BBNColors.accent.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }

                if day.isLoading {
                    Text("Cargando análisis\u{2026}")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                } else if let analysis = day.analysis {
                    // Timeline bar with race-start markers at their progress
                    // positions. Mirrors the web's per-day "timeline with
                    // green dots" visual.
                    if analysis.totalBlocks > 0 {
                        timelineBar(analysis: analysis)
                    }

                    if analysis.raceStarts.isEmpty {
                        Text("Sin carreras detectadas")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textDim)
                    } else {
                        ForEach(analysis.raceStarts) { marker in
                            raceStartRow(marker, filename: day.filename, circuitDir: circuitDir, date: day.date)
                        }
                    }
                }
            }
        }
    }

    /// Mini horizontal timeline showing the recording's span with each
    /// race-start marker rendered as an accent dot at its `progress`
    /// position. Visual-only; interaction lives on the rows below.
    private func timelineBar(analysis: LogAnalysis) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(BBNColors.surface)
                    .frame(height: 4)
                ForEach(analysis.raceStarts) { marker in
                    Circle()
                        .fill(BBNColors.accent)
                        .frame(width: 8, height: 8)
                        .offset(x: geo.size.width * marker.progress - 4, y: 0)
                }
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
        .frame(height: 12)
    }

    private func raceStartRow(_ marker: RaceStartMarker, filename: String, circuitDir: String, date: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(marker.title)
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                HStack(spacing: 8) {
                    Text(Self.timeOnly(marker.timestamp))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(BBNColors.textDim)
                    Text("bloque \(marker.block)")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                    Text("\(Int(marker.progress * 100))%")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                }
            }
            Spacer()
            Image(systemName: "play.circle.fill")
                .font(.system(size: 24))
                .foregroundStyle(BBNColors.accent)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            modalSelection = RaceStartSelection(
                marker: marker, filename: filename, circuitDir: circuitDir, date: date
            )
        }
        .accessibilityLabel("Iniciar replay: \(marker.title)")
    }

    /// Extract "HH:MM:SS" from an ISO8601 string; fall back to the raw
    /// string when parsing fails so something useful renders.
    private static func timeOnly(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) {
            let f = DateFormatter()
            f.dateFormat = "HH:mm:ss"
            return f.string(from: d)
        }
        return iso
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
