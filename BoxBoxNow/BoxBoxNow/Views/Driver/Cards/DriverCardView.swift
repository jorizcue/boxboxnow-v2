import SwiftUI

struct DriverCardView: View {
    let card: DriverCard
    let kart: KartState?
    let raceVM: RaceViewModel
    let ourKartNumber: Int
    let gps: GPSSample?
    let lapDelta: String? // "faster" | "slower" | nil
    var cardHeight: CGFloat = 90
    var clockMs: Double = 0 // interpolated clock from TimelineView
    var lapTracker: LapTracker? = nil

    // Font scale factor relative to base height of 90
    private var scale: CGFloat { min(2.0, max(0.8, cardHeight / 90)) }

    // Use the interpolated clock passed from TimelineView (ticks every second)
    private var raceClock: Double { clockMs }
    private var boxScore: Double { raceVM.boxScore }

    private var ourData: RaceViewModel.OurData? {
        raceVM.computeOurData(ourKartNumber: ourKartNumber, clockMs: clockMs)
    }
    private var racePosition: (pos: Int, total: Int)? {
        raceVM.racePosition(ourKartNumber: ourKartNumber)
    }
    private var stintCalc: RaceViewModel.StintCalc {
        raceVM.computeStintCalc(ourKartNumber: ourKartNumber, clockMs: clockMs)
    }
    private var pitWindowOpen: Bool? {
        raceVM.computePitWindowOpen(ourKartNumber: ourKartNumber, clockMs: clockMs)
    }
    private var avgFutureStint: RaceViewModel.AvgFutureStint? {
        raceVM.computeAvgFutureStint(ourKartNumber: ourKartNumber, clockMs: clockMs)
    }

    /// Cards that skip the title label (content fills the whole card)
    private var hideLabel: Bool {
        card == .pitWindow
    }

    /// Cards that are visually prominent (position, pit window)
    private var isProminent: Bool {
        card == .position || card == .realPos || card == .pitWindow
    }

    var body: some View {
        VStack(spacing: 2 * scale) {
            if !hideLabel {
                HStack(spacing: 3 * scale) {
                    Image(systemName: card.iconName)
                        .font(.system(size: 7 * scale))
                        .foregroundColor(cardAccentColor.opacity(0.7))
                    Text(cardLabel)
                        .font(.system(size: 9 * scale, weight: .medium))
                        .foregroundColor(.gray)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
            }

            cardContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(8 * scale)
        .frame(maxWidth: .infinity)
        .frame(height: cardHeight)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(cardAccentColor.opacity(isProminent ? 0.18 : 0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(cardBorderColor.opacity(isProminent ? 0.7 : 0.5), lineWidth: isProminent ? 2 : 1.5)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: - Dynamic label (some cards show extra info)
    private var cardLabel: String {
        switch card {
        case .gapAhead:
            if let ahead = ourData?.aheadKart {
                return "\(card.displayName) · K\(ahead.kartNumber)"
            }
            return card.displayName
        case .gapBehind:
            if let behind = ourData?.behindKart {
                return "\(card.displayName) · K\(behind.kartNumber)"
            }
            return card.displayName
        case .deltaBestLap:
            if let bestMs = lapTracker?.bestLapMs, bestMs > 0 {
                return "Delta Best · \(Formatters.msToLapTime(bestMs))"
            }
            // Fallback to server stint-best when GPS isn't producing a delta.
            // Use stint-best (not race-best) so the comparison resets after
            // each pit exit and reflects the current driver's pace.
            if let bestMs = kart?.bestStintLapMs, bestMs > 0 {
                return "Delta Stint · \(Formatters.msToLapTime(bestMs))"
            }
            return card.displayName
        case .gpsLapDelta:
            if let lapNum = lapTracker?.currentLap, lapNum > 0 {
                return "\(card.displayName) · V\(lapNum)"
            }
            return card.displayName
        default:
            return card.displayName
        }
    }

    // MARK: - Dynamic accent color (matching web card accent logic)
    private var cardAccentColor: Color {
        switch card {
        case .raceTimer:
            return (raceClock > 0 && raceClock < 600000) ? .red : Color(.systemGray)

        case .lastLap:
            if lapDelta == "faster" { return .green }
            if lapDelta == "slower" { return .yellow }
            return Color(.systemGray)

        case .avgFutureStint:
            return (avgFutureStint?.warn == true) ? .red : .teal

        case .lapsToMaxStint:
            if pitWindowOpen == false { return .red }
            if let laps = stintCalc.lapsToMax {
                if laps <= 2 { return .red }
                if laps <= 5 { return .orange }
            }
            if pitWindowOpen == true { return .green }
            return .teal

        case .pitWindow:
            if pitWindowOpen == true { return .green }
            if pitWindowOpen == false { return .red }
            return Color(.systemGray)

        case .bestStintLap:
            return (kart?.bestStintLapMs ?? 0) > 0 ? .purple : Color(.systemGray)

        case .gpsGForce:
            let latG = abs(gps?.gForceX ?? 0)
            if latG > 1.2 { return .red }
            if latG > 0.7 { return .yellow }
            return Color(red: 0.20, green: 0.78, blue: 0.35) // emerald

        case .deltaBestLap:
            if let d = lapTracker?.deltaBestMs {
                return d < 0 ? .green : .red
            }
            // Stint-best fallback (not race-best) so the color reflects
            // pace within the current stint.
            if let last = kart?.lastLapMs, last > 0,
               let best = kart?.bestStintLapMs, best > 0 {
                return last <= best ? .green : .red
            }
            return .purple

        case .gpsLapDelta:
            if let d = lapTracker?.deltaPrevMs {
                return d < 0 ? .green : .red
            }
            return .cyan

        default:
            return card.accentColor
        }
    }

    private var cardBorderColor: Color { cardAccentColor }

    // Scaled font sizes
    private var mainFont: CGFloat { 24 * scale }
    private var bigFont: CGFloat { 32 * scale }
    private var subFont: CGFloat { 10 * scale }
    private var smallFont: CGFloat { 8 * scale }

    // MARK: - Card content
    @ViewBuilder
    private var cardContent: some View {
        switch card {

        // ── Race Timer ──
        case .raceTimer:
            let isEndingSoon = raceClock > 0 && raceClock < 600000
            Text(Formatters.msToRaceTime(raceClock))
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(isEndingSoon ? .red : .white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── Current Lap Time (GPS) ──
        case .currentLapTime:
            Text("--:--.---")
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── Last Lap (with delta flash) ──
        case .lastLap:
            VStack(spacing: 2 * scale) {
                let lastMs = kart?.lastLapMs
                Text(lastMs != nil && lastMs! > 0 ? Formatters.msToLapTime(lastMs!) : "--:--.---")
                    .font(.system(size: mainFont, weight: .black, design: .monospaced))
                    .foregroundColor(
                        lapDelta == "faster" ? .green :
                        lapDelta == "slower" ? .yellow : .white
                    )
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                if let delta = lapDelta {
                    HStack(spacing: 2) {
                        Text(delta == "faster" ? "↓" : "↑")
                            .font(.system(size: 14 * scale))
                        Text(delta == "faster" ? "Mas rapida" : "Mas lenta")
                            .font(.system(size: subFont, weight: .bold))
                    }
                    .foregroundColor(delta == "faster" ? .green : .yellow)
                }
            }

        // ── Delta Best Lap — live GPS delta if available, else server-based
        // (last lap - best lap) so the card works for users without GPS.
        case .deltaBestLap:
            TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                if gps != nil, let delta = lapTracker?.deltaBestMs {
                    VStack(spacing: 2 * scale) {
                        Text(String(format: "%@%.2fs", delta < 0 ? "" : "+", delta / 1000))
                            .font(.system(size: mainFont, weight: .black, design: .monospaced))
                            .foregroundColor(delta < 0 ? .green : .red)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                        Text(Formatters.msToLapTime(lapTracker?.currentLapElapsedMs ?? 0))
                            .font(.system(size: smallFont, design: .monospaced))
                            .foregroundColor(Color(.systemGray))
                    }
                } else if let last = kart?.lastLapMs, last > 0,
                          let best = kart?.bestStintLapMs, best > 0 {
                    // Stint-best fallback so the delta reflects current
                    // driver's pace, not the all-time race best.
                    let delta = last - best
                    Text(String(format: "%@%.2fs", delta < 0 ? "" : "+", delta / 1000))
                        .font(.system(size: mainFont, weight: .black, design: .monospaced))
                        .foregroundColor(delta <= 0 ? .green : .red)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                } else {
                    Text("--")
                        .font(.system(size: mainFont, design: .monospaced))
                        .foregroundColor(Color(.systemGray4))
                }
            }

        // ── G-Force Radar (GPS) ──
        case .gForceRadar:
            if gps != nil {
                GForceRadarView(gx: gps?.gForceX ?? 0, gy: gps?.gForceY ?? 0)
            } else {
                Text("GPS --")
                    .font(.system(size: 16 * scale, design: .monospaced))
                    .foregroundColor(Color(.systemGray4))
            }

        // ── Position (by avg pace) ──
        case .position:
            HStack(alignment: .lastTextBaseline, spacing: 1) {
                Text(racePosition != nil ? "P\(racePosition!.pos)" : "-")
                    .font(.system(size: bigFont, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                if let rp = racePosition {
                    Text("/\(rp.total)")
                        .font(.system(size: 14 * scale, weight: .semibold))
                        .foregroundColor(Color(.systemGray))
                }
            }

        // ── Real Position (adjusted classification) ──
        case .realPos:
            HStack(alignment: .lastTextBaseline, spacing: 1) {
                Text(ourData != nil ? "P\(ourData!.realPosition)" : "-")
                    .font(.system(size: bigFont, weight: .black, design: .rounded))
                    .foregroundColor(.accentColor)
                if let od = ourData {
                    Text("/\(od.totalKarts)")
                        .font(.system(size: 14 * scale, weight: .semibold))
                        .foregroundColor(Color(.systemGray))
                }
            }

        // ── Gap Ahead (adjusted, seconds) ──
        case .gapAhead:
            if let od = ourData, od.aheadKart != nil {
                VStack(spacing: 2 * scale) {
                    Text(String(format: "-%.1fs", od.aheadSeconds))
                        .font(.system(size: mainFont, weight: .black, design: .monospaced))
                        .foregroundColor(.red)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    if let team = od.aheadKart?.teamName ?? od.aheadKart?.driverName {
                        Text(team)
                            .font(.system(size: smallFont))
                            .foregroundColor(Color(.systemGray))
                            .lineLimit(1)
                    }
                }
            } else {
                Text("P1")
                    .font(.system(size: bigFont, weight: .black, design: .rounded))
                    .foregroundColor(.accentColor)
            }

        // ── Gap Behind (adjusted, seconds) ──
        case .gapBehind:
            if let od = ourData, od.behindKart != nil {
                VStack(spacing: 2 * scale) {
                    Text(String(format: "+%.1fs", od.behindSeconds))
                        .font(.system(size: mainFont, weight: .black, design: .monospaced))
                        .foregroundColor(.green)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    if let team = od.behindKart?.teamName ?? od.behindKart?.driverName {
                        Text(team)
                            .font(.system(size: smallFont))
                            .foregroundColor(Color(.systemGray))
                            .lineLimit(1)
                    }
                }
            } else {
                Text("Ultimo")
                    .font(.system(size: 20 * scale, weight: .black))
                    .foregroundColor(Color(.systemGray))
            }

        // ── Avg Lap 20 ──
        case .avgLap20:
            let avgMs = kart?.avgLap20Ms
            Text(avgMs != nil && avgMs! > 0 ? Formatters.msToLapTime(avgMs!) : "--:--.---")
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── Best 3 (3V) ──
        case .best3:
            let bestMs = kart?.best3Ms
            Text(bestMs != nil && bestMs! > 0 ? Formatters.msToLapTime(bestMs!) : "--:--.---")
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── Avg Future Stint ──
        case .avgFutureStint:
            if let data = avgFutureStint {
                Text(Formatters.secondsToHMS(Int(data.avgMin * 60)))
                    .font(.system(size: mainFont, weight: .black, design: .monospaced))
                    .foregroundColor(data.warn ? .red : .white)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            } else {
                Text("--:--")
                    .font(.system(size: mainFont, design: .monospaced))
                    .foregroundColor(Color(.systemGray))
            }

        // ── Box Score (with tier color) ──
        case .boxScore:
            Text(boxScore > 0 ? String(format: "%.2f", boxScore) : "0")
                .font(.system(size: bigFont, weight: .black, design: .rounded))
                .foregroundColor(Formatters.tierColor(Int(boxScore)))
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── Best Stint Lap ──
        case .bestStintLap:
            let ms = kart?.bestStintLapMs
            Text(ms != nil && ms! > 0 ? Formatters.msToLapTime(ms!) : "--:--.---")
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── GPS Lap Delta (vs previous lap) — refreshes at 4Hz ──
        case .gpsLapDelta:
            TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                if gps == nil {
                    Text("GPS --")
                        .font(.system(size: 16 * scale, design: .monospaced))
                        .foregroundColor(Color(.systemGray4))
                } else if let delta = lapTracker?.deltaPrevMs {
                    VStack(spacing: 2 * scale) {
                        Text(String(format: "%@%.2fs", delta < 0 ? "" : "+", delta / 1000))
                            .font(.system(size: mainFont, weight: .black, design: .monospaced))
                            .foregroundColor(delta < 0 ? .green : .red)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                        Text(Formatters.msToLapTime(lapTracker?.currentLapElapsedMs ?? 0))
                            .font(.system(size: smallFont, design: .monospaced))
                            .foregroundColor(Color(.systemGray))
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                    }
                } else {
                    VStack(spacing: 2 * scale) {
                        Text(lapTracker != nil && (lapTracker?.currentLapElapsedMs ?? 0) > 0
                             ? Formatters.msToLapTime(lapTracker!.currentLapElapsedMs)
                             : "--:--.---")
                            .font(.system(size: mainFont, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(.systemGray))
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                        if let last = lapTracker?.lastLapMs, last > 0 {
                            Text("Prev: \(Formatters.msToLapTime(last))")
                                .font(.system(size: smallFont, design: .monospaced))
                                .foregroundColor(Color(.systemGray4))
                                .minimumScaleFactor(0.5)
                                .lineLimit(1)
                        }
                    }
                }
            }

        // ── GPS Speed ──
        case .gpsSpeed:
            if gps != nil {
                VStack(spacing: 0) {
                    Text(Formatters.speedString(gps?.speedKmh ?? 0))
                        .font(.system(size: 30 * scale, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text("km/h")
                        .font(.system(size: smallFont))
                        .foregroundColor(Color(.systemGray))
                        .textCase(.uppercase)
                }
            } else {
                Text("GPS --")
                    .font(.system(size: 16 * scale, design: .monospaced))
                    .foregroundColor(Color(.systemGray4))
            }

        // ── GPS G-Force (numbers) ──
        case .gpsGForce:
            if gps != nil {
                let latG = abs(gps?.gForceX ?? 0)
                VStack(spacing: 2 * scale) {
                    Text(String(format: "%.1fG", latG))
                        .font(.system(size: 28 * scale, weight: .black, design: .monospaced))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        Text(String(format: "Lat: %.1f", gps?.gForceX ?? 0))
                            .font(.system(size: smallFont, design: .monospaced))
                        Text(String(format: "Fren: %.1f", gps?.gForceY ?? 0))
                            .font(.system(size: smallFont, design: .monospaced))
                    }
                    .foregroundColor(Color(.systemGray))
                }
            } else {
                Text("GPS --")
                    .font(.system(size: 16 * scale, design: .monospaced))
                    .foregroundColor(Color(.systemGray4))
            }

        // ── Laps to Max Stint ──
        case .lapsToMaxStint:
            let laps = stintCalc.lapsToMax
            let realMax = stintCalc.realMaxStintMin
            VStack(spacing: 2 * scale) {
                Text(laps != nil && laps! > 0 ? String(format: "%.1f", laps!) : "0")
                    .font(.system(size: bigFont, weight: .black, design: .monospaced))
                    .foregroundColor(lapsToMaxTextColor)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                if let rm = realMax, rm < raceVM.maxStintMin {
                    let minutes = Int(rm)
                    let secs = Int((rm - Double(minutes)) * 60)
                    Text("max \(minutes):\(String(format: "%02d", secs))")
                        .font(.system(size: smallFont, design: .monospaced))
                        .foregroundColor(.orange)
                }
            }

        // ── PITS (done / min) ──
        case .pitCount:
            let done = kart?.pitCount ?? 0
            let missing = max(0, raceVM.minPits - done)
            VStack(spacing: 2 * scale) {
                HStack(alignment: .lastTextBaseline, spacing: 1) {
                    Text("\(done)")
                        .font(.system(size: bigFont, weight: .black, design: .rounded))
                        .foregroundColor(missing == 0 ? .green : .white)
                    Text("/\(raceVM.minPits)")
                        .font(.system(size: 14 * scale, weight: .semibold))
                        .foregroundColor(Color(.systemGray))
                }
                if missing > 0 {
                    Text("Faltan \(missing)")
                        .font(.system(size: smallFont, weight: .bold))
                        .foregroundColor(.orange)
                }
            }

        // ── Current Pit (live elapsed time) ──
        // Matches web DriverView "currentPit" card: shows M:SS counting up from 0,
        // with a "/ M:SS" subtitle showing the configured pit time.
        // pitInCountdownMs is sent by the backend in the pitIn event and snapshot
        // so we can compute elapsed = pitInCountdownMs − raceClock (both in ms).
        case .currentPit:
            let inPit = (kart?.pitStatus == "in_pit")
            if inPit {
                let pitInCd = kart?.pitInCountdownMs ?? 0
                let elapsed = pitInCd > 0 && raceClock > 0
                    ? max(0, pitInCd - raceClock) / 1000
                    : 0
                let m = Int(elapsed) / 60
                let s = Int(elapsed) % 60
                let pitM = Int(raceVM.pitTimeS) / 60
                let pitS = Int(raceVM.pitTimeS) % 60
                VStack(spacing: 2 * scale) {
                    Text("\(m):\(String(format: "%02d", s))")
                        .font(.system(size: mainFont, weight: .black, design: .monospaced))
                        .foregroundColor(.cyan)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                        .modifier(PulseModifier(active: true))
                    Text("/ \(pitM):\(String(format: "%02d", pitS))")
                        .font(.system(size: smallFont, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(.systemGray))
                }
            } else {
                VStack(spacing: 2 * scale) {
                    Text("--:--")
                        .font(.system(size: mainFont, design: .monospaced))
                        .foregroundColor(Color(.systemGray4))
                    Text("inactivo")
                        .font(.system(size: smallFont, weight: .medium))
                        .foregroundColor(Color(.systemGray4))
                }
            }

        // ── Pit Window (no title — full card) ──
        case .pitWindow:
            VStack(spacing: 4 * scale) {
                Text(pitWindowFullText)
                    .font(.system(size: mainFont, weight: .black))
                    .foregroundColor(pitWindowTextColor)
                    .textCase(.uppercase)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    // Pulse animation when CLOSED (matching web animate-pulse)
                    .modifier(PulseModifier(active: pitWindowOpen == false))

                if pitWindowOpen == false, let kart = kart {
                    let stintStart = kart.stintStartCountdownMs ?? (raceVM.durationMs > 0 ? raceVM.durationMs : raceClock)
                    let stintSec = max(0, stintStart - raceClock) / 1000
                    let remainSec = max(0, raceVM.minStintMin * 60 - stintSec)
                    let m = Int(remainSec) / 60
                    let s = Int(remainSec) % 60
                    Text("\(m):\(String(format: "%02d", s))")
                        .font(.system(size: subFont, design: .monospaced))
                        .foregroundColor(.red.opacity(0.7))
                }
            }
        }
    }

    // MARK: - Accessibility description
    private var accessibilityDescription: String {
        switch card {
        case .raceTimer:
            return "Tiempo de carrera: \(Formatters.msToRaceTime(raceClock))"
        case .currentLapTime:
            return "Vuelta actual"
        case .lastLap:
            let t = kart?.lastLapMs.flatMap { $0 > 0 ? Formatters.msToLapTime($0) : nil } ?? "sin datos"
            let delta = lapDelta == "faster" ? ", mas rapida" : lapDelta == "slower" ? ", mas lenta" : ""
            return "Ultima vuelta: \(t)\(delta)"
        case .deltaBestLap:
            if let d = lapTracker?.deltaBestMs {
                return "Delta vs mejor: \(String(format: "%@%.2f segundos", d < 0 ? "" : "+", d / 1000))"
            }
            if let last = kart?.lastLapMs, last > 0,
               let best = kart?.bestStintLapMs, best > 0 {
                let d = last - best
                return "Delta vs mejor del stint: \(String(format: "%@%.2f segundos", d < 0 ? "" : "+", d / 1000))"
            }
            return "Delta vs mejor: sin datos"
        case .gForceRadar:
            return "Radar de fuerza G"
        case .position:
            if let rp = racePosition { return "Posicion: P\(rp.pos) de \(rp.total)" }
            return "Posicion: sin datos"
        case .realPos:
            if let od = ourData { return "Posicion real: P\(od.realPosition) de \(od.totalKarts)" }
            return "Posicion real: sin datos"
        case .gapAhead:
            if let od = ourData, od.aheadKart != nil {
                return "Diferencia adelante: \(String(format: "%.1f", od.aheadSeconds)) segundos"
            }
            return "Diferencia adelante: primero"
        case .gapBehind:
            if let od = ourData, od.behindKart != nil {
                return "Diferencia detras: \(String(format: "%.1f", od.behindSeconds)) segundos"
            }
            return "Diferencia detras: ultimo"
        case .avgLap20:
            let t = kart?.avgLap20Ms.flatMap { $0 > 0 ? Formatters.msToLapTime($0) : nil } ?? "sin datos"
            return "Media 20 vueltas: \(t)"
        case .best3:
            let t = kart?.best3Ms.flatMap { $0 > 0 ? Formatters.msToLapTime($0) : nil } ?? "sin datos"
            return "Mejor 3 vueltas: \(t)"
        case .avgFutureStint:
            if let data = avgFutureStint {
                return "Media stint futuro: \(Formatters.secondsToHMS(Int(data.avgMin * 60)))"
            }
            return "Media stint futuro: sin datos"
        case .boxScore:
            return "Box score: \(boxScore > 0 ? String(format: "%.2f", boxScore) : "0")"
        case .bestStintLap:
            let t = kart?.bestStintLapMs.flatMap { $0 > 0 ? Formatters.msToLapTime($0) : nil } ?? "sin datos"
            return "Mejor vuelta del stint: \(t)"
        case .gpsLapDelta:
            if let d = lapTracker?.deltaPrevMs {
                return "Delta vuelta anterior: \(String(format: "%@%.2f segundos", d < 0 ? "" : "+", d / 1000))"
            }
            return "Delta vuelta anterior: sin datos"
        case .gpsSpeed:
            return "Velocidad: \(Formatters.speedString(gps?.speedKmh ?? 0)) km/h"
        case .gpsGForce:
            return "Fuerza G: \(String(format: "%.1f", abs(gps?.gForceX ?? 0))) G"
        case .lapsToMaxStint:
            if let laps = stintCalc.lapsToMax {
                return "Vueltas hasta max stint: \(String(format: "%.1f", laps))"
            }
            return "Vueltas hasta max stint: sin datos"
        case .pitWindow:
            if pitWindowOpen == true { return "Ventana de pit: abierta" }
            if pitWindowOpen == false { return "Ventana de pit: cerrada" }
            return "Ventana de pit: sin datos"
        case .pitCount:
            let done = kart?.pitCount ?? 0
            return "Pits: \(done) de \(raceVM.minPits)"
        case .currentPit:
            if kart?.pitStatus == "in_pit" { return "Pit en curso" }
            return "Pit en curso: sin datos"
        }
    }

    // MARK: - Laps to max stint text color (matching web lines 843-853)
    private var lapsToMaxTextColor: Color {
        if pitWindowOpen == false { return .red }
        if let laps = stintCalc.lapsToMax {
            if laps <= 2 { return .red }
            if laps <= 5 { return .orange }
        }
        if pitWindowOpen == true { return .green }
        return .white
    }

    // MARK: - Pit window text (full label, no separate title)
    private var pitWindowFullText: String {
        if pitWindowOpen == true { return "PIT OPEN" }
        if pitWindowOpen == false { return "PIT CLOSED" }
        return "--"
    }

    private var pitWindowTextColor: Color {
        if pitWindowOpen == true { return .green }
        if pitWindowOpen == false { return .red }
        return Color(.systemGray)
    }
}

// MARK: - Pulse animation (matches Tailwind animate-pulse: opacity 1→0.5→1 over 2s)

struct PulseModifier: ViewModifier {
    let active: Bool
    @State private var pulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(active && pulsing ? 0.4 : 1.0)
            .animation(
                active
                    ? .easeInOut(duration: 1.0).repeatForever(autoreverses: true)
                    : .default,
                value: pulsing
            )
            .onChange(of: active) {
                pulsing = active
            }
            .onAppear {
                if active { pulsing = true }
            }
    }
}
