import Foundation
import SwiftUI

enum RaceFormatters {
    /// Formats a millisecond lap time as `s.mmm` or `m:ss.mmm`.
    /// Returns `"—"` for nil or non-positive values.
    static func lapTime(ms: Double?) -> String {
        guard let ms, ms > 0 else { return "—" }
        let totalMs = Int(ms.rounded())
        let minutes = totalMs / 60_000
        let seconds = (totalMs % 60_000) / 1_000
        let millis = totalMs % 1_000
        if minutes > 0 {
            return String(format: "%d:%02d.%03d", minutes, seconds, millis)
        }
        return String(format: "%d.%03d", seconds, millis)
    }

    /// Formats a 1-based position as `"Nº"`.
    static func position(_ p: Int) -> String { "\(p)º" }

    /// Formats an elapsed stint duration (ms) as `m:ss`.
    static func stint(elapsedMs: Double?) -> String {
        guard let elapsedMs, elapsedMs >= 0 else { return "—" }
        let total = Int(elapsedMs / 1000)
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// Formats stint duration (seconds) with lap count, e.g. "12:30 (5v)".
    static func stintWithLaps(durationS: Double?, laps: Int?) -> String {
        guard let durationS, durationS >= 0 else { return "—" }
        let total = Int(durationS)
        let timeStr = String(format: "%d:%02d", total / 60, total % 60)
        if let laps, laps > 0 {
            return "\(timeStr) (\(laps)v)"
        }
        return timeStr
    }

    /// Color for stint time based on race config thresholds.
    static func stintColor(durationS: Double?, config: RaceConfig?) -> Color {
        guard let durationS, let config else { return BBNColors.textPrimary }
        let minutes = durationS / 60
        let maxStint = Double(config.maxStintMin)
        let minStint = Double(config.minStintMin)

        if minutes >= maxStint { return BBNColors.danger }
        if minutes < minStint { return BBNColors.textDim }
        if (maxStint - minutes) <= 5 { return BBNColors.warning }
        return BBNColors.success
    }

    /// Formats a gap/interval in ms as `±s.mmm`. Sign is included so the
    /// driver sees at a glance whether the differential is positive or
    /// negative. Returns "—" for nil, zero, or non-finite values.
    static func gap(ms: Double?) -> String {
        guard let ms, ms.isFinite, ms != 0 else { return "—" }
        let sign = ms > 0 ? "+" : "-"
        let totalMs = Int(abs(ms).rounded())
        let seconds = totalMs / 1000
        let millis = totalMs % 1000
        return String(format: "%@%d.%03d", sign, seconds, millis)
    }

    /// Formats race countdown (ms) as `H:MM:SS`.
    static func countdown(ms: Double) -> String {
        let total = max(0, Int(ms / 1000))
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        return String(format: "%d:%02d:%02d", h, m, s)
    }

    /// Formats seconds to `HH:MM:SS`.
    static func hms(seconds: Double) -> String {
        let total = max(0, Int(seconds))
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        return String(format: "%d:%02d:%02d", h, m, s)
    }
}
