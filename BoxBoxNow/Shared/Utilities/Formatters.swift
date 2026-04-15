import SwiftUI

enum Formatters {
    /// Convert ms to M:SS.mmm — matches web msToLapTime()
    static func msToLapTime(_ ms: Double) -> String {
        guard ms > 0 else { return "-" }
        let totalMs = Int(ms)
        let minutes = totalMs / 60000
        let seconds = (totalMs % 60000) / 1000
        let millis = totalMs % 1000
        if minutes > 0 {
            return String(format: "%d:%02d.%03d", minutes, seconds, millis)
        }
        return String(format: "%d.%03d", seconds, millis)
    }

    /// Delta string: +0.123 or -0.456
    static func deltaString(_ ms: Double) -> String {
        let sign = ms >= 0 ? "+" : ""
        return String(format: "%@%.1fs", sign, ms / 1000.0)
    }

    /// Delta color matching web logic
    static func deltaColor(_ ms: Double) -> Color {
        if ms < -10 { return .green }
        if ms > 10 { return .red }
        return .white
    }

    static func speedString(_ kmh: Double) -> String {
        String(format: "%.0f", kmh)
    }

    static func gForceString(_ g: Double) -> String {
        String(format: "%.2f", g)
    }

    /// Race clock HH:MM:SS — matches web format
    static func msToRaceTime(_ ms: Double) -> String {
        guard ms > 0 else { return "--:--:--" }
        let totalSeconds = Int(ms / 1000)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d:%02d", hours, minutes, seconds)
    }

    /// Seconds to HH:MM:SS — matches web secondsToHMS()
    static func secondsToHMS(_ seconds: Int) -> String {
        guard seconds > 0 else { return "00:00:00" }
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        return String(format: "%02d:%02d:%02d", h, m, s)
    }

    /// Seconds to M:SS (short format for stint times)
    static func secondsToStint(_ seconds: Double) -> String {
        guard seconds > 0 else { return "0:00" }
        let min = Int(seconds) / 60
        let sec = Int(seconds) % 60
        return String(format: "%d:%02d", min, sec)
    }

    /// Tier hex color for box score (0-100) — matches web tierHex()
    static func tierColor(_ score: Int) -> Color {
        if score >= 100 { return Color(red: 0.624, green: 0.898, blue: 0.337) } // #9fe556
        if score >= 75  { return Color(red: 0.784, green: 0.914, blue: 0.275) } // #c8e946
        if score >= 50  { return Color(red: 0.898, green: 0.831, blue: 0.227) } // #e5d43a
        if score >= 25  { return Color(red: 0.898, green: 0.604, blue: 0.180) } // #e59a2e
        return Color(red: 0.898, green: 0.267, blue: 0.267) // #e54444
    }

    static func distanceString(_ meters: Double) -> String {
        if meters >= 1000 {
            return String(format: "%.1f km", meters / 1000.0)
        }
        return String(format: "%.0f m", meters)
    }
}
