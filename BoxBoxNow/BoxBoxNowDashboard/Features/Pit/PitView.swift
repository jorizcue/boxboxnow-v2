import SwiftUI

/// Pit / Box strategy dashboard — iPad counterpart of the web `FifoQueue` tab.
///
/// Layout (top to bottom):
///   1. Row of 9 live indicator cards (same as Race tab) + BOX + rain toggle
///   2. Left "PUNT. BOX" score tile + right FIFO queue grid
///      (boxLines rows × ceil(boxKarts/boxLines) columns)
///   3. Row of 8 pit status cards (pit timer, minPitTime, pits X/Y, etc.)
///
/// Everything updates in real time off `RaceStore.interpolatedCountdownMs`.
struct PitView: View {
    @Environment(AppStore.self) private var app

    private var race: RaceStore { app.race }
    private var config: RaceConfig? { race.config }

    private var ourKart: KartStateFull? {
        guard let num = config?.ourKartNumber, num > 0 else { return nil }
        return race.karts.first { $0.base.kartNumber == num }
    }

    private func stintSeconds(for kart: KartStateFull) -> Double {
        let clock = race.interpolatedCountdownMs
        if clock <= 0 || race.raceFinished { return 0 }
        let start = kart.base.stintStartCountdownMs ?? (race.durationMs > 0 ? race.durationMs : clock)
        return max(0, (start - clock) / 1000)
    }

    private var boxScore: Double { race.fifo.score }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Top: indicator cards — reuses the Race panel so the two
                // tabs stay in lockstep (same fields, same colors).
                RaceInfoPanel()
                    .padding(.bottom, 4)

                HStack(alignment: .top, spacing: 10) {
                    boxScoreTile
                    fifoGrid
                }

                pitStatusRow
            }
            .padding(12)
        }
        .background(BBNColors.background)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Estrategia de boxes")
    }

    // MARK: - Box score tile (left)

    private var boxScoreTile: some View {
        VStack(spacing: 4) {
            Circle()
                .fill(boxScoreDotColor)
                .frame(width: 10, height: 10)
            Text("PUNT. BOX")
                .font(.system(size: 9, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textMuted)
            Text(boxScore > 0 ? String(format: "%.1f", boxScore) : "—")
                .font(.system(size: 34, weight: .black))
                .foregroundStyle(BBNColors.tier(forScore: boxScore))
                .monospacedDigit()
            Text("/ 100")
                .font(.system(size: 9, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textDim)
        }
        .frame(width: 110)
        .frame(maxHeight: .infinity)
        .padding(.vertical, 10)
        .background(BBNColors.surface)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(BBNColors.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var boxScoreDotColor: Color {
        if boxScore >= 75 { return BBNColors.accent }
        if boxScore >= 50 { return BBNColors.tier50 }
        if boxScore >= 25 { return BBNColors.tier25 }
        return BBNColors.danger
    }

    // MARK: - FIFO grid (right)

    private var boxLines: Int { max(1, config?.boxLines ?? 2) }
    private var boxKarts: Int { max(1, config?.boxKarts ?? 4) }
    private var kartsPerRow: Int { max(1, Int(ceil(Double(boxKarts) / Double(boxLines)))) }

    /// Split the FIFO queue into `boxLines` rows, respecting each entry's
    /// pre-assigned `line`. Defaults (no line) fill the left side of each row.
    /// Mirrors the same algorithm as `FifoQueue.tsx`.
    private var rows: [[FifoEntry?]] {
        let queue = Array(race.fifo.queue.prefix(boxKarts))
        var result: [[FifoEntry?]] = Array(repeating: [], count: boxLines)
        var realByLine: [[FifoEntry]] = Array(repeating: [], count: boxLines)
        var defaults: [FifoEntry] = []

        for entry in queue {
            if let line = entry.line, line >= 0, line < boxLines {
                realByLine[line].append(entry)
            } else {
                defaults.append(entry)
            }
        }

        for r in 0..<boxLines {
            let realCount = realByLine[r].count
            let defaultCount = kartsPerRow - realCount
            var row: [FifoEntry?] = []
            for _ in 0..<max(0, defaultCount) {
                if !defaults.isEmpty {
                    row.append(defaults.removeFirst())
                }
            }
            row.append(contentsOf: realByLine[r].map { Optional($0) })
            if !row.isEmpty { result[r] = row }
        }
        return result.filter { !$0.isEmpty }
    }

    private var fifoGrid: some View {
        VStack(spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { rowIdx, row in
                HStack(spacing: 8) {
                    Text("🏁")
                        .font(.system(size: 20))
                        .frame(width: 28)

                    HStack(spacing: 6) {
                        ForEach(Array(row.enumerated()), id: \.offset) { _, entry in
                            BoxTile(entry: entry)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 1) {
                        Text("F\(rowIdx + 1)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(BBNColors.danger)
                        Text("←")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(BBNColors.danger)
                    }
                }
            }

            if rows.isEmpty {
                Text("Sin datos de box")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textDim)
                    .padding(24)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 140, alignment: .top)
        .background(BBNColors.surface)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(BBNColors.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Pit status row (bottom)

    private var pitStatusRow: some View {
        let ourPitCount = ourKart?.base.pitCount ?? 0
        let minPits = config?.minPits ?? 0
        let pitTimeS = config?.pitTimeS ?? 180
        let pitInProgress = ourKart?.base.isInPit == true
        let pitElapsedSec: Double = {
            guard let k = ourKart, pitInProgress, race.interpolatedCountdownMs > 0 else { return 0 }
            if let last = k.pitHistory.last, last.pitTimeMs == 0, last.raceTimeMs > 0 {
                let raceElapsedMs = Double(config?.durationMin ?? 0) * 60 * 1000 - race.interpolatedCountdownMs
                return max(0, (raceElapsedMs - last.raceTimeMs) / 1000)
            }
            return ourKart.map(stintSeconds) ?? 0
        }()

        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 8), spacing: 8) {
            PitStatCard(
                label: "PIT EN CURSO",
                value: RaceFormatters.hhmmss(seconds: pitElapsedSec),
                accent: pitInProgress
            )
            PitStatCard(
                label: "TIEMPO MINIMO DE PIT",
                value: RaceFormatters.hhmmss(seconds: Double(pitTimeS))
            )
            PitStatCard(
                label: "PITS",
                value: "\(ourPitCount)/\(minPits)",
                accent: minPits > 0 && ourPitCount < minPits
            )
            PitStatCard(
                label: "STINT MINIMO",
                value: RaceFormatters.hhmmss(seconds: Double(config?.minStintMin ?? 0) * 60)
            )
            PitStatCard(
                label: "STINT MAXIMO",
                value: RaceFormatters.hhmmss(seconds: Double(config?.maxStintMin ?? 0) * 60)
            )
            PitStatCard(
                label: "MEDIA STINT FUTURO",
                value: avgFutureStintDisplay,
                warn: avgFutureStintWarn
            )
            PitStatCard(
                label: "LINEAS BOX",
                value: "\(config?.boxLines ?? 0)"
            )
            PitStatCard(
                label: "KARTS EN BOX",
                value: "\(config?.boxKarts ?? 0)"
            )
        }
    }

    /// Average remaining stint length = (totalRace − elapsed − futurePits×pitTime) / remainingPits
    /// Matches the web `avgFutureStint` calc in `FifoQueue.tsx`.
    private var avgFutureStintMin: Double? {
        guard let kart = ourKart, let cfg = config else { return nil }
        if race.interpolatedCountdownMs <= 0 || race.raceFinished { return nil }
        let remainingPits = max(0, cfg.minPits - kart.base.pitCount)
        if remainingPits <= 0 { return nil }
        let totalRaceMin = Double(cfg.durationMin)
        let elapsedMs = race.durationMs > 0 ? max(0, race.durationMs - race.interpolatedCountdownMs) : 0
        let elapsedMin = elapsedMs / 1000 / 60
        let futurePitMin = Double(remainingPits) * cfg.pitTimeS / 60
        let availableMin = totalRaceMin - elapsedMin - futurePitMin
        if availableMin <= 0 { return nil }
        return availableMin / Double(remainingPits)
    }

    private var avgFutureStintDisplay: String {
        guard let avg = avgFutureStintMin else { return "—" }
        return RaceFormatters.hhmmss(seconds: avg * 60)
    }

    private var avgFutureStintWarn: Bool {
        guard let avg = avgFutureStintMin, let cfg = config else { return false }
        let tooEarly = avg > Double(cfg.maxStintMin)
        let tooLate = avg <= Double(cfg.minStintMin) + 5
        return tooEarly || tooLate
    }
}

// MARK: - Box tile (single square in the FIFO grid)

private struct BoxTile: View {
    let entry: FifoEntry?

    var body: some View {
        let score = entry?.score ?? 25
        let team = entry?.teamName ?? ""
        let driver = entry?.driverName ?? ""
        let hasInfo = !team.isEmpty || !driver.isEmpty

        VStack(spacing: 2) {
            Text("\(Int(score))")
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(BBNColors.tier(forScore: score))
            if hasInfo {
                Text(team)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(BBNColors.textMuted)
                    .lineLimit(1)
                Text(driver)
                    .font(.system(size: 8))
                    .foregroundStyle(BBNColors.textDim)
                    .lineLimit(1)
            } else {
                Text("Box")
                    .font(.system(size: 10))
                    .foregroundStyle(BBNColors.textDim)
            }
        }
        .frame(minWidth: 80, maxWidth: 140, minHeight: 64)
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .background(BBNColors.card)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(BBNColors.border, lineWidth: 1.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Pit stat card (bottom row)

private struct PitStatCard: View {
    let label: String
    let value: String
    var accent: Bool = false
    var warn: Bool = false

    var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textMuted)
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text(value)
                .font(.system(size: 16, weight: .black, design: .monospaced))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, minHeight: 60)
        .padding(6)
        .background(BBNColors.card)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(borderColor, lineWidth: accent || warn ? 2 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var color: Color {
        if warn { return BBNColors.warning }
        if accent { return BBNColors.tier25 }
        return BBNColors.textPrimary
    }

    private var borderColor: Color {
        if warn { return BBNColors.warning.opacity(0.5) }
        if accent { return BBNColors.tier25.opacity(0.5) }
        return BBNColors.border
    }
}
