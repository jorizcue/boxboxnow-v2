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

    /// User-configurable refresh rate (Hz) for the GPS delta cards.
    /// Set in GPSConfigView. Default 2 Hz. Forwarded to the dedicated
    /// `DeltaBestLapContent` / `DeltaPrevLapContent` subviews, which
    /// snapshot the lapTracker values into @State at this cadence so
    /// the on-screen number is decoupled from the parent's 50 Hz
    /// re-render cycle (driverVM.gpsData fires @Published per sample,
    /// invalidating DriverView and the whole card grid).
    @AppStorage(Constants.Keys.gpsDeltaRefreshHz) private var deltaRefreshHz: Int = 2

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
        case .intervalAhead:
            if let ahead = raceVM.apexNeighbor(ourKartNumber: ourKartNumber, offset: -1) {
                return "\(card.displayName) · K\(ahead.kartNumber)"
            }
            return card.displayName
        case .intervalBehind:
            if let behind = raceVM.apexNeighbor(ourKartNumber: ourKartNumber, offset: 1) {
                return "\(card.displayName) · K\(behind.kartNumber)"
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
            DeltaBestLapContent(
                lapTracker: lapTracker,
                kart: kart,
                gpsAvailable: gps != nil,
                refreshHz: deltaRefreshHz,
                mainFont: mainFont,
                smallFont: smallFont,
                scale: scale
            )

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

        // ── GPS Lap Delta (vs previous lap)
        case .gpsLapDelta:
            DeltaPrevLapContent(
                lapTracker: lapTracker,
                gpsAvailable: gps != nil,
                refreshHz: deltaRefreshHz,
                mainFont: mainFont,
                smallFont: smallFont,
                scale: scale
            )

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

        // ── Δ Best S1 / S2 / S3 ──
        // Sector index is the trailing digit in the case name; we resolve
        // it to an Int so the same render branch covers all three sectors.
        // The kart's `currentSNMs` and the field-best from `sectorMeta`
        // both use the SECTOR index — backend resolved the cN→sector
        // mapping from the live grid header. When I'm the field-best
        // holder, show only a star + my margin over second-best (in
        // green). Otherwise show the deficit + leader's kart number /
        // team / driver (in red).
        case .deltaBestS1, .deltaBestS2, .deltaBestS3:
            sectorDeltaContent(for: sectorIdx(for: card))

        // ── Vuelta teorica = sum of my own per-sector PBs ──
        case .theoreticalBestLap:
            theoreticalBestLapContent

        // ── Δ Sectores: combined S1/S2/S3 deltas in 3 lines ──
        case .deltaSectors:
            deltaSectorsContent

        // ── Apex live timing: interval to kart in front ──
        // myKart.interval IS the gap to the kart in front. Empty when
        // the local pilot leads the apex order — show "LIDER" sentinel
        // in that case (per pilot feedback, "—" reads as "no data").
        case .intervalAhead:
            let raw = kart?.interval
            let display = raceVM.formatApexInterval(raw, leaderSentinel: "LIDER")
            Text(display)
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(display == "LIDER" ? .yellow : .white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── Apex live timing: interval reported by kart behind me ──
        // The apex `interval` field for any kart measures THEIR distance
        // to the kart immediately ahead. So the kart at position+1 in
        // the live timing has its own `.interval` field equal to its
        // gap to me — exactly what we want to show on the local card.
        case .intervalBehind:
            let behind = raceVM.apexNeighbor(ourKartNumber: ourKartNumber, offset: 1)
            let raw = behind?.interval
            let display: String = behind == nil
                ? "—"  // I'm last; nothing behind to measure
                : raceVM.formatApexInterval(raw, leaderSentinel: "—")
            Text(display)
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

        // ── Apex live timing: raw position (P{n}/{total}) ──
        // Distinct from `position` (avg-pace) and `realPos` (adjusted
        // classification) — this surfaces the value straight from
        // Apex's `data-type="rk"` column.
        case .apexPosition:
            HStack(alignment: .lastTextBaseline, spacing: 1) {
                if let ap = raceVM.apexPosition(ourKartNumber: ourKartNumber) {
                    Text("P\(ap.pos)")
                        .font(.system(size: bigFont, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    Text("/\(ap.total)")
                        .font(.system(size: 14 * scale, weight: .semibold))
                        .foregroundColor(Color(.systemGray))
                } else {
                    Text("—")
                        .font(.system(size: bigFont, weight: .black, design: .rounded))
                        .foregroundColor(Color(.systemGray3))
                }
            }
        }
    }

    /// Map a sector card to its sector index (1/2/3).
    private func sectorIdx(for card: DriverCard) -> Int {
        switch card {
        case .deltaBestS1: return 1
        case .deltaBestS2: return 2
        case .deltaBestS3: return 3
        default: return 0
        }
    }

    /// Render the "Δ Best Sn" body. Reads `kart.currentSNMs` and
    /// `raceVM.sectorMeta.sN` (which carries the field-best holder +
    /// the runner-up's bestMs). Three states:
    ///   1. Session has no sectors / no kart yet / no field-best → "--"
    ///   2. I'm the field-best holder → star + "-X.XXs" green
    ///   3. I'm not the holder → "+X.XXs" red + "#K Team / Driver"
    @ViewBuilder
    private func sectorDeltaContent(for sectorIdx: Int) -> some View {
        // Cálculo del delta centralizado en RaceViewModel.sectorDelta —
        // reutilizado por la card combinada `deltaSectors` (3 líneas
        // S1/S2/S3 sin nombres de líder).
        let leader = raceVM.sectorMeta?.best(for: sectorIdx)
        let result = raceVM.sectorDelta(ourKartNumber: ourKartNumber, sectorIdx: sectorIdx)

        if !raceVM.hasSectors || leader == nil || result == nil {
            Text("--")
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(Color(.systemGray3))
        } else {
            let isMine = result!.isMine
            let d = result!.deltaMs
            // Three Spacers split the available vertical space into
            // roughly thirds: top empty, delta in upper third, mid
            // empty, leader-block (kart # + name on separate lines)
            // in lower third, bottom empty. Keeps the delta visually
            // anchored a bit below the title while keeping the leader
            // info readable above the bottom edge.
            let signText = d < 0 ? "-" : "+"
            VStack(spacing: 0) {
                Spacer()
                Text("\(signText)\(String(format: "%.2fs", abs(d) / 1000))")
                    .font(.system(size: bigFont * 1.15, weight: .black, design: .monospaced))
                    .foregroundColor(isMine ? .green : .red)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Spacer()
                if !isMine, let l = leader {
                    VStack(spacing: 2 * scale) {
                        Text("#\(l.kartNumber)")
                            .font(.system(size: mainFont * 0.85, weight: .bold))
                            .foregroundColor(.gray)
                            .lineLimit(1)
                        let name = leaderName(for: l)
                        if !name.isEmpty {
                            Text(name)
                                .font(.system(size: mainFont * 0.62, weight: .semibold))
                                .foregroundColor(.gray)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                                .minimumScaleFactor(0.6)
                        }
                    }
                    .padding(.horizontal, 4 * scale)
                    Spacer()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// Render del cuerpo de la card combinada `Δ Sectores` — 3 líneas
    /// `S1/S2/S3` con etiqueta a la izquierda y delta a la derecha.
    /// Reusa `RaceViewModel.sectorDelta(...)` así que la matemática
    /// vive en un solo sitio (compartida con las cards individuales).
    @ViewBuilder
    private var deltaSectorsContent: some View {
        if !raceVM.hasSectors {
            Text("--")
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(Color(.systemGray3))
        } else {
            // GeometryReader so we can size fonts off both the actual
            // width AND height of the card body. Earlier versions used
            // only cardHeight and the value text was overflowing
            // narrow-tall cards (portrait layouts) → SwiftUI fell back
            // to truncation despite minimumScaleFactor, leaving the
            // pilot with "+0..." in place of the actual delta.
            //
            // Width budget for the value text "+X.XXs" (6 chars,
            // monospaced, char width ≈ 0.6×fontSize):
            //   value text width ≈ font × 0.6 × 6 = font × 3.6
            //   We want it ≤ ~70% of available width to leave room
            //   for the label + spacer + horizontal padding.
            //   → font ≤ 0.7 × width / 3.6 ≈ width × 0.19
            //
            // The 90pt overall cap is tuned so the card looks balanced
            // in single-row layouts where 3 cards span the full screen.
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                let valueFont: CGFloat = max(20, min(90, min(h * 0.22, w * 0.19)))
                let labelFont: CGFloat = max(14, min(28, valueFont * 0.4))
                VStack(spacing: 0) {
                    ForEach([1, 2, 3], id: \.self) { n in
                        deltaSectorsLine(sectorIdx: n, valueFont: valueFont, labelFont: labelFont)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 6 * scale)
            }
        }
    }

    /// One row of the combined sector-delta card: "S{n}" left, value
    /// right (or `—` when there's no data yet for that sector). Fonts
    /// arrive pre-sized from the parent so the three lines stay
    /// aligned + scale together with the card.
    @ViewBuilder
    private func deltaSectorsLine(sectorIdx n: Int, valueFont: CGFloat, labelFont: CGFloat) -> some View {
        let r = raceVM.sectorDelta(ourKartNumber: ourKartNumber, sectorIdx: n)
        HStack(spacing: 6 * scale) {
            Text("S\(n)")
                .font(.system(size: labelFont, weight: .semibold))
                .foregroundColor(.gray)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Spacer(minLength: 4)
            if let d = r?.deltaMs, let isMine = r?.isMine {
                let sign = d < 0 ? "-" : "+"
                Text("\(sign)\(String(format: "%.2fs", abs(d) / 1000))")
                    .font(.system(size: valueFont, weight: .black, design: .monospaced))
                    .foregroundColor(isMine ? .green : .red)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            } else {
                Text("—")
                    .font(.system(size: valueFont, weight: .black, design: .monospaced))
                    .foregroundColor(Color(.systemGray3))
            }
        }
    }

    /// "#K Team/Driver" label for the field-best holder. Falls back
    /// gracefully when team/driver names are missing (some circuits
    /// only populate one of the two columns). Used by the
    /// accessibility text — visual rendering uses `leaderName(for:)`
    /// to render the kart number and the name on separate lines.
    private func leaderLabel(for leader: SectorBest) -> String {
        let t = (leader.teamName ?? "").trimmingCharacters(in: .whitespaces)
        let d = (leader.driverName ?? "").trimmingCharacters(in: .whitespaces)
        if !t.isEmpty && !d.isEmpty { return "#\(leader.kartNumber) \(t)/\(d)" }
        if !t.isEmpty { return "#\(leader.kartNumber) \(t)" }
        if !d.isEmpty { return "#\(leader.kartNumber) \(d)" }
        return "#\(leader.kartNumber)"
    }

    /// Just the team / driver name portion (no kart prefix), used as
    /// the second line of the sector-card leader block. Returns an
    /// empty string when neither team nor driver is populated, in
    /// which case the visual layout drops the second line entirely.
    private func leaderName(for leader: SectorBest) -> String {
        let t = (leader.teamName ?? "").trimmingCharacters(in: .whitespaces)
        let d = (leader.driverName ?? "").trimmingCharacters(in: .whitespaces)
        if !t.isEmpty && !d.isEmpty { return "\(t)/\(d)" }
        if !t.isEmpty { return t }
        if !d.isEmpty { return d }
        return ""
    }

    /// Theoretical best lap = sum of my session-long S1/S2/S3 PBs.
    /// When any sector is missing (session just started or circuit
    /// without sectors), show "--". Below the time we show the
    /// pilot's real best so they see how much pace they leave on
    /// the table by not stringing together their best sectors.
    @ViewBuilder
    private var theoreticalBestLapContent: some View {
        let s1 = kart?.bestS1Ms ?? 0
        let s2 = kart?.bestS2Ms ?? 0
        let s3 = kart?.bestS3Ms ?? 0
        let realBest = kart?.bestLapMs ?? 0

        if !raceVM.hasSectors || s1 <= 0 || s2 <= 0 || s3 <= 0 {
            Text("--")
                .font(.system(size: mainFont, weight: .black, design: .monospaced))
                .foregroundColor(Color(.systemGray3))
        } else {
            let theoMs = s1 + s2 + s3
            VStack(spacing: 2 * scale) {
                Text(Formatters.msToLapTime(theoMs))
                    .font(.system(size: mainFont, weight: .black, design: .monospaced))
                    .foregroundColor(.pink)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                if realBest > 0 {
                    Text("Real: \(Formatters.msToLapTime(realBest))")
                        .font(.system(size: smallFont, weight: .medium, design: .monospaced))
                        .foregroundColor(.gray)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
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
        case .deltaBestS1, .deltaBestS2, .deltaBestS3:
            let n = sectorIdx(for: card)
            guard raceVM.hasSectors,
                  let leader = raceVM.sectorMeta?.best(for: n) else {
                return "Delta sector \(n): sin datos"
            }
            let isMine = (kart?.kartNumber == leader.kartNumber)
            if isMine {
                if let myB = (n == 1 ? kart?.bestS1Ms : n == 2 ? kart?.bestS2Ms : kart?.bestS3Ms),
                   myB > 0, let s = leader.secondBestMs, s > 0 {
                    return "Sector \(n) lider, ventaja \(String(format: "%.2f", (s - myB) / 1000)) segundos"
                }
                return "Sector \(n) lider"
            }
            let cur = (n == 1 ? kart?.currentS1Ms : n == 2 ? kart?.currentS2Ms : kart?.currentS3Ms) ?? 0
            if cur <= 0 { return "Delta sector \(n): sin datos" }
            let d = (cur - leader.bestMs) / 1000
            return "Sector \(n): +\(String(format: "%.2f", d)) segundos del lider kart \(leader.kartNumber)"
        case .theoreticalBestLap:
            let s1 = kart?.bestS1Ms ?? 0, s2 = kart?.bestS2Ms ?? 0, s3 = kart?.bestS3Ms ?? 0
            guard raceVM.hasSectors, s1 > 0, s2 > 0, s3 > 0 else {
                return "Vuelta teorica: sin datos"
            }
            return "Vuelta teorica: \(Formatters.msToLapTime(s1 + s2 + s3))"
        case .intervalAhead:
            let raw = (kart?.interval ?? "").trimmingCharacters(in: .whitespaces)
            if raw.isEmpty { return "Intervalo kart delantero: lider" }
            return "Intervalo kart delantero: \(raw)"
        case .intervalBehind:
            guard let behind = raceVM.apexNeighbor(ourKartNumber: ourKartNumber, offset: 1) else {
                return "Intervalo kart trasero: sin datos"
            }
            let raw = (behind.interval ?? "").trimmingCharacters(in: .whitespaces)
            if raw.isEmpty { return "Intervalo kart trasero: sin datos" }
            return "Intervalo kart trasero: \(raw), kart \(behind.kartNumber)"
        case .apexPosition:
            if let ap = raceVM.apexPosition(ourKartNumber: ourKartNumber) {
                return "Posicion Apex: P\(ap.pos) de \(ap.total)"
            }
            return "Posicion Apex: sin datos"
        case .deltaSectors:
            if !raceVM.hasSectors { return "Delta sectores: sin datos" }
            var parts: [String] = []
            for n in 1...3 {
                if let r = raceVM.sectorDelta(ourKartNumber: ourKartNumber, sectorIdx: n) {
                    let sign = r.deltaMs < 0 ? "menos" : "más"
                    parts.append("S\(n) \(sign) \(String(format: "%.2f", abs(r.deltaMs) / 1000)) segundos")
                } else {
                    parts.append("S\(n) sin datos")
                }
            }
            return "Delta sectores: \(parts.joined(separator: ", "))"
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

// MARK: - GPS Delta cards (decoupled from parent re-render rate)
//
// Both subviews snapshot the lapTracker values into local @State at the
// pilot-configured cadence (1/2/4 Hz). The parent (DriverView) re-renders
// at the RaceBox sample rate (~50 Hz) because driverVM.gpsData is
// @Published per sample — but the visible Text only flips when @State
// changes, which the .task(id:) loop controls precisely.
//
// .task(id: refreshHz) is automatically cancelled+restarted when the
// pilot moves the picker, so the cadence change applies live.

private struct DeltaBestLapContent: View {
    let lapTracker: LapTracker?
    let kart: KartState?
    let gpsAvailable: Bool
    let refreshHz: Int
    let mainFont: CGFloat
    let smallFont: CGFloat
    let scale: CGFloat

    @State private var snapDelta: Double? = nil
    @State private var snapElapsed: Double = 0

    var body: some View {
        Group {
            if gpsAvailable, let delta = snapDelta {
                VStack(spacing: 2 * scale) {
                    Text(String(format: "%@%.2fs", delta < 0 ? "" : "+", delta / 1000))
                        .font(.system(size: mainFont, weight: .black, design: .monospaced))
                        .foregroundColor(delta < 0 ? .green : .red)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(Formatters.msToLapTime(snapElapsed))
                        .font(.system(size: smallFont, design: .monospaced))
                        .foregroundColor(Color(.systemGray))
                }
            } else if let last = kart?.lastLapMs, last > 0,
                      let best = kart?.bestStintLapMs, best > 0 {
                // Stint-best fallback (server-driven; updates on lap crossing).
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
        .task(id: refreshHz) {
            let interval = 1.0 / Double(max(1, refreshHz))
            let nanos = UInt64(interval * 1_000_000_000)
            // Initial snapshot so the card paints immediately.
            snapDelta = lapTracker?.deltaBestMs
            snapElapsed = lapTracker?.currentLapElapsedMs ?? 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: nanos)
                if Task.isCancelled { break }
                snapDelta = lapTracker?.deltaBestMs
                snapElapsed = lapTracker?.currentLapElapsedMs ?? 0
            }
        }
    }
}

private struct DeltaPrevLapContent: View {
    let lapTracker: LapTracker?
    let gpsAvailable: Bool
    let refreshHz: Int
    let mainFont: CGFloat
    let smallFont: CGFloat
    let scale: CGFloat

    @State private var snapDelta: Double? = nil
    @State private var snapElapsed: Double = 0
    @State private var snapLastLap: Double = 0

    var body: some View {
        Group {
            if !gpsAvailable {
                Text("GPS --")
                    .font(.system(size: 16 * scale, design: .monospaced))
                    .foregroundColor(Color(.systemGray4))
            } else if let delta = snapDelta {
                VStack(spacing: 2 * scale) {
                    Text(String(format: "%@%.2fs", delta < 0 ? "" : "+", delta / 1000))
                        .font(.system(size: mainFont, weight: .black, design: .monospaced))
                        .foregroundColor(delta < 0 ? .green : .red)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(Formatters.msToLapTime(snapElapsed))
                        .font(.system(size: smallFont, design: .monospaced))
                        .foregroundColor(Color(.systemGray))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
            } else {
                VStack(spacing: 2 * scale) {
                    Text(snapElapsed > 0 ? Formatters.msToLapTime(snapElapsed) : "--:--.---")
                        .font(.system(size: mainFont, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(.systemGray))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    if snapLastLap > 0 {
                        Text("Prev: \(Formatters.msToLapTime(snapLastLap))")
                            .font(.system(size: smallFont, design: .monospaced))
                            .foregroundColor(Color(.systemGray4))
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                    }
                }
            }
        }
        .task(id: refreshHz) {
            let interval = 1.0 / Double(max(1, refreshHz))
            let nanos = UInt64(interval * 1_000_000_000)
            snapDelta = lapTracker?.deltaPrevMs
            snapElapsed = lapTracker?.currentLapElapsedMs ?? 0
            snapLastLap = lapTracker?.lastLapMs ?? 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: nanos)
                if Task.isCancelled { break }
                snapDelta = lapTracker?.deltaPrevMs
                snapElapsed = lapTracker?.currentLapElapsedMs ?? 0
                snapLastLap = lapTracker?.lastLapMs ?? 0
            }
        }
    }
}
