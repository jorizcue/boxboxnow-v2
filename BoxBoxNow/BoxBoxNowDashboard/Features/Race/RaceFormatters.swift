import Foundation

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

    /// Formats a gap/interval in ms as `±s.mmm`. Sign is included so the
    /// driver sees at a glance whether the differential is positive or
    /// negative. Returns "—" for nil, zero, or non-finite values.
    static func gap(ms: Double?) -> String {
        guard let ms, ms.isFinite, ms != 0 else { return "—" }
        let sign = ms > 0 ? "+" : ""
        let totalMs = Int(abs(ms).rounded())
        let seconds = totalMs / 1000
        let millis = totalMs % 1000
        return String(format: "%@%d.%03d", sign, seconds, millis)
    }
}
