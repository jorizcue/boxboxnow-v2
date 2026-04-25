import SwiftUI

/// Renders one driver-view card. Mirrors the web `DriverView.tsx` cards
/// dict: label uppercase top-center, big value in the middle, optional
/// subtitle below; background uses a per-card accent gradient with a
/// matching border stroke.
///
/// Values derive from the passed `KartStateFull` (our kart state), the
/// interpolated race `countdownMs`, plus `fifo` (for box score) and
/// `config` (for pits remaining and pit-time). GPS-derived cards
/// (deltaBestLap, gForceRadar, gpsLapDelta, gpsSpeed, gpsGForce) render
/// a "GPS —" placeholder on the iPad because the dashboard doesn't carry
/// a local GPS source — that data only exists on the driver phone app.
struct DriverCardView: View {
    let cardId: String
    let kart: KartStateFull?
    let countdownMs: Double
    let height: CGFloat

    // Optional context for box/pit cards. Defaults keep the existing
    // call sites (DriverGridView) working; richer call sites pass the
    // live values.
    var fifoScore: Double = 0
    var minPits: Int = 0
    var pitTimeS: Double = 0
    var durationMs: Double = 0

    var body: some View {
        VStack(spacing: 4) {
            Text(DriverCardCatalog.label(for: cardId).uppercased())
                .font(.system(size: 9, weight: .bold))
                .tracking(1)
                .foregroundStyle(BBNColors.textDim)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)

            Spacer(minLength: 4)

            Text(mainValue)
                .font(.system(size: valueFontSize, weight: .black, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(valueColor)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .frame(maxWidth: .infinity)

            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(BBNColors.textDim)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(height: height)
        .background(
            LinearGradient(
                colors: [accent.opacity(0.22), accent.opacity(0.04)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(accent.opacity(0.38), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(DriverCardCatalog.label(for: cardId)), \(mainValue)")
    }

    private var valueFontSize: CGFloat { min(height * 0.42, 96) }

    // MARK: - Per-card accent (mirrors web's CARD_ACCENTS palette)

    private var accent: Color {
        switch cardId {
        case "raceTimer":          return Color(bbnHex: 0x9ca3af)               // neutral-400
        case "currentLapTime":     return Color(bbnHex: 0x3b82f6)               // blue
        case "lastLap":            return Color(bbnHex: 0xa3a3a3)               // neutral
        case "deltaBestLap":       return Color(bbnHex: 0x8b5cf6)               // violet
        case "gForceRadar":        return Color(bbnHex: 0x737373)               // neutral darker
        case "position":           return Color(bbnHex: 0xa855f7)               // purple
        case "realPos":            return BBNColors.accent                      // brand green
        case "gapAhead":           return Color(bbnHex: 0xef4444)               // red
        case "gapBehind":          return Color(bbnHex: 0x22c55e)               // green
        case "avgLap20":           return Color(bbnHex: 0x6366f1)               // indigo
        case "best3":              return Color(bbnHex: 0xf59e0b)               // amber
        case "avgFutureStint":     return Color(bbnHex: 0x14b8a6)               // teal
        case "boxScore":           return Color(bbnHex: 0xeab308)               // yellow
        case "bestStintLap":       return Color(bbnHex: 0xa855f7)               // purple
        case "gpsLapDelta":        return Color(bbnHex: 0x06b6d4)               // cyan
        case "gpsSpeed":           return Color(bbnHex: 0x0ea5e9)               // sky
        case "gpsGForce":          return Color(bbnHex: 0x10b981)               // emerald
        case "lapsToMaxStint":     return Color(bbnHex: 0x14b8a6)               // teal
        case "pitWindow":          return Color(bbnHex: 0x22c55e)               // green
        case "pitCount":           return Color(bbnHex: 0xf97316)               // orange
        case "currentPit":         return Color(bbnHex: 0x06b6d4)               // cyan
        default:                   return BBNColors.border
        }
    }

    // MARK: - Value color (per-card overrides)

    private var valueColor: Color {
        switch cardId {
        case "lastLap":
            guard let k = kart, let last = k.base.lastLapMs, let best = k.base.bestLapMs,
                  last > 0, best > 0 else { return BBNColors.textPrimary }
            return last <= best ? BBNColors.accent : BBNColors.textPrimary
        case "boxScore":
            return BBNColors.tier(forScore: fifoScore)
        case "pitCount":
            let done = kart?.base.pitCount ?? 0
            return done < minPits ? Color(bbnHex: 0xf97316) : BBNColors.accent
        case "realPos":
            return BBNColors.accent
        case "gapAhead":
            return Color(bbnHex: 0xef4444)
        case "gapBehind":
            return Color(bbnHex: 0x22c55e)
        case "deltaBestLap":
            guard let k = kart,
                  let last = k.base.lastLapMs, last > 0,
                  let best = k.base.bestLapMs, best > 0 else { return BBNColors.textPrimary }
            return last <= best ? BBNColors.accent : Color(bbnHex: 0xef4444)
        default:
            return BBNColors.textPrimary
        }
    }

    // MARK: - Subtitle

    private var subtitle: String? {
        switch cardId {
        case "boxScore":
            return fifoScore > 0 ? "/ 100" : nil
        case "pitCount":
            let done = kart?.base.pitCount ?? 0
            let missing = max(0, minPits - done)
            return missing > 0 ? "faltan \(missing)" : nil
        case "currentPit":
            if kart?.base.isInPit == true { return pitTimeS > 0 ? "/ \(Int(pitTimeS))s" : nil }
            return "inactivo"
        case "gpsSpeed", "gpsLapDelta", "gpsGForce", "gForceRadar":
            return "requiere GPS"
        case "deltaBestLap":
            return nil
        default:
            return nil
        }
    }

    // MARK: - Main value

    private var mainValue: String {
        // Always-available cards (don't need a kart row)
        switch cardId {
        case "raceTimer":
            return formatCountdown(countdownMs)
        case "boxScore":
            return fifoScore > 0 ? String(Int(fifoScore)) : "0"
        case "pitWindow":
            return pitWindowValue
        default: break
        }

        guard let k = kart else { return "—" }
        switch cardId {
        case "currentLapTime":
            return "—"   // GPS live lap
        case "lastLap":
            return RaceFormatters.lapTime(ms: k.base.lastLapMs)
        case "position":
            return RaceFormatters.position(k.base.position)
        case "realPos":
            return RaceFormatters.position(k.base.position)
        case "gapAhead":
            return k.base.gap.map { formatGap($0, sign: "-") } ?? "—"
        case "gapBehind":
            return k.base.interval.map { formatGap($0, sign: "+") } ?? "—"
        case "avgLap20":
            return RaceFormatters.lapTime(ms: k.base.avgLapMs)
        case "best3":
            return RaceFormatters.lapTime(ms: k.base.bestAvgMs)
        case "bestStintLap":
            return RaceFormatters.lapTime(ms: k.base.bestStintLapMs)
        case "avgFutureStint":
            return "—"
        case "lapsToMaxStint":
            return "—"
        case "pitCount":
            return "\(k.base.pitCount)/\(minPits)"
        case "currentPit":
            return k.base.isInPit ? "EN PIT" : "—:—"
        case "deltaBestLap":
            guard let k = kart,
                  let last = k.base.lastLapMs, last > 0,
                  let best = k.base.bestLapMs, best > 0 else { return "—" }
            let delta = last - best
            let sign = delta < 0 ? "" : "+"
            return String(format: "%@%.2fs", sign, delta / 1000)
        case "gForceRadar", "gpsLapDelta", "gpsSpeed", "gpsGForce":
            return "GPS —"
        default:
            return "—"
        }
    }

    /// Simple pit-window heuristic matching the web's behavior: if there's
    /// a configured `pitClosedStart/End` window around the countdown, show
    /// CLOSED, otherwise OPEN. We don't have pit-closed fields here — this
    /// is a safe fallback until full computation is ported.
    private var pitWindowValue: String {
        guard countdownMs > 0 else { return "—" }
        return "OPEN"
    }

    private func formatGap(_ raw: String, sign: String) -> String {
        // Server-supplied strings like "1.234" — prepend sign if not already.
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("-") || trimmed.hasPrefix("+") { return "\(trimmed)s" }
        return "\(sign)\(trimmed)s"
    }

    /// HH:MM:SS for the race timer, matching the web's `msToCountdown` format.
    /// Returns "—" for zero/negative values so empty states render as dashes
    /// instead of "0:00:00".
    private func formatCountdown(_ ms: Double) -> String {
        guard ms > 0 else { return "—" }
        let totalMs = Int(ms)
        let h = totalMs / 3_600_000
        let m = (totalMs % 3_600_000) / 60_000
        let s = (totalMs % 60_000) / 1_000
        return String(format: "%d:%02d:%02d", h, m, s)
    }
}
