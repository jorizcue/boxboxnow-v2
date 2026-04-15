import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xff) / 255
        let g = Double((hex >> 8)  & 0xff) / 255
        let b = Double(hex & 0xff) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }

    // Background layer (from tailwind.config.js)
    static let bbnBackground  = Color(hex: 0x000000)
    static let bbnSurface     = Color(hex: 0x111111)
    static let bbnCard        = Color(hex: 0x0a0a0a)
    static let bbnBorder      = Color(hex: 0x1a1a1a)

    // Accent
    static let bbnAccent      = Color(hex: 0x9fe556)
    static let bbnAccentHover = Color(hex: 0xb8f070)
    static let bbnAccentDim   = Color(hex: 0x9fe556).opacity(0.15)

    // Text
    static let bbnText        = Color.white
    static let bbnTextMuted   = Color(hex: 0xe5e5e5)
    static let bbnTextDim     = Color(hex: 0x808080)

    // Tier scale (leaderboard)
    static let bbnTier100 = Color(hex: 0x9fe556)
    static let bbnTier75  = Color(hex: 0xc8e946)
    static let bbnTier50  = Color(hex: 0xe5d43a)
    static let bbnTier25  = Color(hex: 0xe59a2e)
    static let bbnTier1   = Color(hex: 0xe54444)

    // Status
    static let bbnSuccess = Color(hex: 0x22c55e)
    static let bbnDanger  = Color(hex: 0xef4444)
    static let bbnWarning = Color(hex: 0xeab308)

    /// Map a tier score (0-100) to one of the 5 buckets.
    static func bbnTier(forScore score: Double) -> Color {
        switch score {
        case 88...: return .bbnTier100
        case 63..<88: return .bbnTier75
        case 38..<63: return .bbnTier50
        case 13..<38: return .bbnTier25
        default: return .bbnTier1
        }
    }
}
