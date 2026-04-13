import SwiftUI

enum Formatters {
    static func msToLapTime(_ ms: Double) -> String {
        let totalSeconds = ms / 1000.0
        let minutes = Int(totalSeconds) / 60
        let seconds = totalSeconds.truncatingRemainder(dividingBy: 60)
        if minutes > 0 {
            return String(format: "%d:%06.3f", minutes, seconds)
        }
        return String(format: "%.3f", seconds)
    }

    static func deltaString(_ ms: Double) -> String {
        let sign = ms >= 0 ? "+" : ""
        return String(format: "%@%.3f", sign, ms / 1000.0)
    }

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

    static func distanceString(_ meters: Double) -> String {
        if meters >= 1000 {
            return String(format: "%.1f km", meters / 1000.0)
        }
        return String(format: "%.0f m", meters)
    }
}
