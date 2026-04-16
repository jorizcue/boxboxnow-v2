import SwiftUI

/// Renders one driver-view card. The `cardId` is a string key from
/// `DriverCardCatalog`; the value is derived from `KartStateFull` or
/// race-level state passed in. Cards whose data source isn't available
/// yet (GPS cards, complex analytics) show "—".
struct DriverCardView: View {
    let cardId: String
    let kart: KartStateFull?
    let countdownMs: Double
    let height: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(DriverCardCatalog.label(for: cardId).uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(BBNColors.textMuted)
                .lineLimit(1)
            Spacer()
            Text(mainValue)
                .font(.system(size: valueFontSize, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(valueColor)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .frame(height: height)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(DriverCardCatalog.label(for: cardId)), \(mainValue)")
    }

    private var valueFontSize: CGFloat { min(height * 0.45, 96) }

    private var valueColor: Color {
        switch cardId {
        case "lastLap":
            // Green if last lap == personal best
            guard let k = kart, let last = k.base.lastLapMs, let best = k.base.bestLapMs,
                  last > 0, best > 0 else { return BBNColors.textPrimary }
            return last <= best ? BBNColors.accent : BBNColors.textPrimary
        case "boxScore":
            if let ts = kart?.base.tierScore { return BBNColors.tier(forScore: ts) }
            return BBNColors.textPrimary
        default:
            return BBNColors.textPrimary
        }
    }

    private var mainValue: String {
        guard let k = kart else { return "—" }
        switch cardId {
        // --- Race group ---
        case "raceTimer":
            return formatCountdown(countdownMs)
        case "currentLapTime":
            return "—"  // GPS real-time lap, future iteration
        case "lastLap":
            return RaceFormatters.lapTime(ms: k.base.lastLapMs)
        case "position":
            return RaceFormatters.position(k.base.position)
        case "realPos":
            return "—"  // Adjusted classification, future iteration
        case "gapAhead":
            return k.base.gap ?? "—"   // Already a formatted string from server
        case "gapBehind":
            return k.base.interval ?? "—"  // Already a formatted string from server
        case "avgLap20":
            return RaceFormatters.lapTime(ms: k.base.avgLapMs)
        case "best3":
            return RaceFormatters.lapTime(ms: k.base.bestAvgMs)
        case "bestStintLap":
            return RaceFormatters.lapTime(ms: k.base.bestStintLapMs)
        case "avgFutureStint":
            return "—"  // Complex calc, future iteration
        case "lapsToMaxStint":
            return "—"  // Complex calc, future iteration
        // --- Box group ---
        case "boxScore":
            return "\(k.base.boxScore ?? 0)"
        case "pitCount":
            return "\(k.base.pitCount)"
        case "currentPit":
            return k.base.isInPit ? "EN PIT" : "—"
        case "pitWindow":
            return "—"  // Pit-window open/closed logic, future iteration
        // --- GPS group ---
        case "deltaBestLap", "gForceRadar", "gpsLapDelta", "gpsSpeed", "gpsGForce":
            return "—"  // GPS data, future iteration
        default:
            return "—"
        }
    }

    /// Formats a countdown-millisecond value as "Xh Xm Xs". Matches the
    /// web's `raceClockStr` format in `DriverView.tsx`.
    private func formatCountdown(_ ms: Double) -> String {
        guard ms > 0 else { return "—" }
        let totalMs = Int(ms)
        let h = totalMs / 3_600_000
        let m = (totalMs % 3_600_000) / 60_000
        let s = (totalMs % 60_000) / 1_000
        return "\(h)h \(m)m \(s)s"
    }
}
