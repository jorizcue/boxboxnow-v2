import SwiftUI

/// Kart analytics tab — matches the web `KartAnalyticsTab.tsx` layout:
///   • Top filters row (circuit picker, date range, filter-outliers toggle)
///   • Totals strip (Carreras · Karts · Vueltas válidas · Mejor vuelta)
///   • Sortable table: #, Kart, Top 5 avg, Avg lap, Best lap, Carreras,
///                     Vueltas, Equipos
///
/// Tapping the "Top 5" or "Mejor" cells opens a best-laps sheet;
/// tapping the row's Kart number opens the driver-breakdown sheet
/// (existing `KartAnalyticsDetailSheet`).
struct KartAnalyticsView: View {
    @Environment(AppStore.self) private var app

    @State private var dateFrom: Date = Calendar.current.date(byAdding: .day, value: -7, to: .now) ?? .now
    @State private var dateTo: Date = Date.now
    @State private var selectedKart: KartStats?
    @State private var bestLapsKart: KartStats?
    @State private var sortKey: SortKey = .best5
    @State private var sortAsc: Bool = true

    enum SortKey { case best5, avg, best, races, laps, kart }

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
                ProgressView().tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if app.analytics.circuits.isEmpty {
                PlaceholderView(text: "No hay circuitos disponibles")
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    filtersRow
                    totalsStrip
                    tableContent
                }
                .padding(20)
            }
        }
        .background(BBNColors.background)
        .task { if app.analytics.circuits.isEmpty { await app.analytics.loadCircuits() } }
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
        .sheet(item: $bestLapsKart) { kart in
            BestLapsSheet(
                kart: kart,
                circuitId: app.analytics.selectedCircuitId ?? 0,
                dateFrom: dateFromString,
                dateTo: dateToString
            )
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
            Button { reloadStats() } label: {
                Image(systemName: "arrow.clockwise")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.accent)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Filters

    private var filtersRow: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("CIRCUITO")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textMuted)
                Menu {
                    ForEach(app.analytics.circuits) { circuit in
                        Button(circuit.name) { app.analytics.selectedCircuitId = circuit.id }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(selectedCircuitName)
                            .font(BBNTypography.body)
                            .foregroundStyle(BBNColors.textPrimary)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 10))
                            .foregroundStyle(BBNColors.textDim)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(BBNColors.surface)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(BBNColors.border, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("DESDE")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textMuted)
                DatePicker("", selection: $dateFrom, displayedComponents: .date)
                    .labelsHidden().tint(BBNColors.accent)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("HASTA")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textMuted)
                DatePicker("", selection: $dateTo, displayedComponents: .date)
                    .labelsHidden().tint(BBNColors.accent)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("FILTRAR ATIPICOS")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BBNColors.textMuted)
                @Bindable var analytics = app.analytics
                Toggle("", isOn: $analytics.filterOutliers)
                    .labelsHidden().tint(BBNColors.accent)
            }

            Spacer()
        }
    }

    // MARK: - Totals strip

    private var totalsStrip: some View {
        let stats = app.analytics.kartStats
        let races = stats.reduce(0) { max($0, $1.races) }   // max observed across karts
        let karts = stats.count
        let laps = stats.reduce(0) { $0 + $1.validLaps }
        let best: Int? = {
            let nz = stats.compactMap { $0.bestLapMs > 0 ? $0.bestLapMs : nil }
            return nz.min()
        }()

        return HStack(spacing: 10) {
            totalCard(label: "CARRERAS", value: "\(races)")
            totalCard(label: "KARTS", value: "\(karts)")
            totalCard(label: "VUELTAS VÁLIDAS", value: "\(laps)")
            totalCard(label: "MEJOR VUELTA", value: best.map { RaceFormatters.lapTime(ms: Double($0)) } ?? "—")
        }
    }

    private func totalCard(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textMuted)
            Text(value)
                .font(.system(size: 22, weight: .black, design: .monospaced))
                .foregroundStyle(BBNColors.textPrimary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BBNColors.surface)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(BBNColors.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Table

    @ViewBuilder
    private var tableContent: some View {
        if app.analytics.selectedCircuitId == nil {
            PlaceholderView(text: "Selecciona un circuito")
        } else if app.analytics.kartStats.isEmpty {
            PlaceholderView(text: "Sin datos de analytics")
        } else {
            kartTable
        }
    }

    private var kartTable: some View {
        VStack(spacing: 0) {
            tableHeader
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(Array(sortedStats.enumerated()), id: \.element.id) { index, kart in
                        tableRow(index: index + 1, kart: kart)
                        Divider().overlay(BBNColors.border.opacity(0.5))
                    }
                }
            }
        }
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var tableHeader: some View {
        HStack(spacing: 0) {
            headerCell("#", width: 38, align: .leading)
            headerCell("KART", width: 64, align: .leading, key: .kart)
            headerCell("TOP 5", width: 98, align: .trailing, key: .best5)
            headerCell("AVG LAP", width: 98, align: .trailing, key: .avg)
            headerCell("MEJOR", width: 98, align: .trailing, key: .best)
            headerCell("CARRERAS", width: 80, align: .trailing, key: .races)
            headerCell("VUELTAS", width: 80, align: .trailing, key: .laps)
            headerCell("EQUIPOS", width: nil, align: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(BBNColors.card)
    }

    @ViewBuilder
    private func headerCell(_ text: String, width: CGFloat?, align: Alignment, key: SortKey? = nil) -> some View {
        let isSorted = key != nil && key == sortKey
        let label = HStack(spacing: 4) {
            Text(text)
                .font(.system(size: 10, weight: .bold))
                .tracking(1)
            if isSorted {
                Image(systemName: sortAsc ? "chevron.up" : "chevron.down")
                    .font(.system(size: 8, weight: .bold))
            }
        }
        .foregroundStyle(isSorted ? BBNColors.accent : BBNColors.textMuted)
        .frame(width: width, alignment: align)
        .frame(maxWidth: width == nil ? .infinity : nil, alignment: align)

        if let key {
            Button { toggleSort(key) } label: { label }.buttonStyle(.plain)
        } else {
            label
        }
    }

    private func tableRow(index: Int, kart: KartStats) -> some View {
        HStack(spacing: 0) {
            Text("\(index)")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(BBNColors.textDim)
                .frame(width: 38, alignment: .leading)

            Button { selectedKart = kart } label: {
                Text("\(kart.kartNumber)")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(BBNColors.accent)
                    .frame(width: 64, alignment: .leading)
            }.buttonStyle(.plain)

            // Tap Top 5 cell → best laps sheet
            Button { bestLapsKart = kart } label: {
                Text(RaceFormatters.lapTime(ms: kart.best5AvgMs))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(tierColor(kart.best5AvgMs))
                    .frame(width: 98, alignment: .trailing)
            }.buttonStyle(.plain)

            Text(RaceFormatters.lapTime(ms: kart.avgLapMs))
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(BBNColors.textPrimary)
                .frame(width: 98, alignment: .trailing)

            Button { bestLapsKart = kart } label: {
                Text(RaceFormatters.lapTime(ms: Double(kart.bestLapMs)))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Color(bbnHex: 0xa855f7)) // purple — "best" accent
                    .frame(width: 98, alignment: .trailing)
            }.buttonStyle(.plain)

            Text("\(kart.races)")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 80, alignment: .trailing)

            Text("\(kart.validLaps)")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 80, alignment: .trailing)

            Text(kart.teams.joined(separator: ", "))
                .font(.system(size: 11))
                .foregroundStyle(BBNColors.textDim)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    // MARK: - Sort

    private func toggleSort(_ key: SortKey) {
        if sortKey == key { sortAsc.toggle() } else { sortKey = key; sortAsc = true }
    }

    private var sortedStats: [KartStats] {
        let list = app.analytics.kartStats
        let cmp: (KartStats, KartStats) -> Bool
        switch sortKey {
        case .best5: cmp = { $0.best5AvgMs < $1.best5AvgMs }
        case .avg:   cmp = { $0.avgLapMs < $1.avgLapMs }
        case .best:  cmp = { $0.bestLapMs < $1.bestLapMs }
        case .races: cmp = { $0.races < $1.races }
        case .laps:  cmp = { $0.validLaps < $1.validLaps }
        case .kart:  cmp = { $0.kartNumber < $1.kartNumber }
        }
        let asc = list.sorted(by: cmp)
        return sortAsc ? asc : asc.reversed()
    }

    /// Color a lap time relative to the field: fastest karts green,
    /// slowest red. We bucket by quartile for readability.
    private func tierColor(_ ms: Double) -> Color {
        guard ms > 0 else { return BBNColors.textDim }
        let valids = app.analytics.kartStats.map { $0.best5AvgMs }.filter { $0 > 0 }.sorted()
        guard valids.count >= 4 else { return BBNColors.textPrimary }
        let q1 = valids[valids.count / 4]
        let q3 = valids[3 * valids.count / 4]
        if ms <= q1 { return BBNColors.accent }
        if ms >= q3 { return BBNColors.danger }
        return BBNColors.textPrimary
    }

    // MARK: - Helpers

    private var selectedCircuitName: String {
        if let id = app.analytics.selectedCircuitId,
           let c = app.analytics.circuits.first(where: { $0.id == id }) {
            return c.name
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

// MARK: - Best Laps sheet (tapping top-5 or best cell)

private struct BestLapsSheet: View {
    let kart: KartStats
    let circuitId: Int
    let dateFrom: String
    let dateTo: String

    @State private var laps: [KartBestLap] = []
    @State private var loading: Bool = true
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading) {
                    Text("Mejores vueltas")
                        .font(BBNTypography.title2)
                        .foregroundStyle(BBNColors.textPrimary)
                    Text("Kart \(kart.kartNumber) · \(dateFrom) → \(dateTo)")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(BBNColors.textDim)
                }.buttonStyle(.plain)
            }
            .padding(20)

            Divider().overlay(BBNColors.border)

            if loading {
                ProgressView().tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else if laps.isEmpty {
                PlaceholderView(text: "Sin vueltas registradas en el rango")
                    .frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(Array(laps.enumerated()), id: \.element.id) { idx, lap in
                            HStack {
                                Text("\(idx + 1)")
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundStyle(BBNColors.textDim)
                                    .frame(width: 40, alignment: .leading)
                                Text(RaceFormatters.lapTime(ms: Double(lap.lapTimeMs)))
                                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                                    .foregroundStyle(idx == 0 ? BBNColors.accent : BBNColors.textPrimary)
                                    .frame(width: 110, alignment: .leading)
                                Text("V\(lap.lapNumber)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(BBNColors.textDim)
                                    .frame(width: 50, alignment: .leading)
                                Text(lap.teamName)
                                    .font(.system(size: 12))
                                    .foregroundStyle(BBNColors.textPrimary)
                                    .lineLimit(1)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(lap.driverName)
                                    .font(.system(size: 12))
                                    .foregroundStyle(BBNColors.textMuted)
                                    .lineLimit(1)
                                    .frame(width: 160, alignment: .leading)
                                Text(lap.raceDate)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(BBNColors.textDim)
                                    .frame(width: 90, alignment: .trailing)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            Divider().overlay(BBNColors.border.opacity(0.5))
                        }
                    }
                }
            }
        }
        .frame(minWidth: 720, minHeight: 480)
        .background(BBNColors.background)
        .task { await load() }
    }

    private func load() async {
        do {
            let svc = AnalyticsService()
            laps = try await svc.kartBestLaps(
                circuitId: circuitId,
                kartNumber: kart.kartNumber,
                dateFrom: dateFrom,
                dateTo: dateTo
            )
        } catch {
            laps = []
        }
        loading = false
    }
}
