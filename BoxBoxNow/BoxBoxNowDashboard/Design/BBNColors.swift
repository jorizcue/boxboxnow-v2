import SwiftUI

// Design-system color tokens for the dashboard app.
//
// Accessibility note: this token set is optimized for a dark-only UI
// (BoxBoxNowDashboardApp forces `.preferredColorScheme(.dark)`). Contrast
// ratios were picked against the dashboard background, not the system
// default light theme. Dynamic Type and VoiceOver-specific tokens are
// deliberately not defined here; an accessibility pass is tracked as
// follow-up work once the navigation shell lands and we can measure real
// call sites.
//
// Call-site convention: use the `BBNColors.*` namespace, not a Color
// extension. This matches the rest of the dashboard module (Tasks 14+
// assume this shape) and keeps the global Color namespace uncluttered.
enum BBNColors {
    // Background layers (darkest → lightest)
    static let background  = Color(bbnHex: 0x000000)
    static let card        = Color(bbnHex: 0x0a0a0a)
    static let surface     = Color(bbnHex: 0x111111)
    static let border      = Color(bbnHex: 0x1a1a1a)

    // Accent
    static let accent      = Color(bbnHex: 0x9fe556)

    // Text
    static let textPrimary = Color.white
    static let textMuted   = Color(bbnHex: 0xe5e5e5)
    static let textDim     = Color(bbnHex: 0x808080)

    // Tier scale (leaderboard — internal to BBNTierBadge for now)
    static let tier100 = Color(bbnHex: 0x9fe556)
    static let tier75  = Color(bbnHex: 0xc8e946)
    static let tier50  = Color(bbnHex: 0xe5d43a)
    static let tier25  = Color(bbnHex: 0xe59a2e)
    static let tier1   = Color(bbnHex: 0xe54444)

    // Status
    static let success = Color(bbnHex: 0x22c55e)
    static let danger  = Color(bbnHex: 0xef4444)
    static let warning = Color(bbnHex: 0xeab308)

    /// Map a tier score (0-100) to one of the 5 buckets.
    static func tier(forScore score: Double) -> Color {
        switch score {
        case 88...: return tier100
        case 63..<88: return tier75
        case 38..<63: return tier50
        case 13..<38: return tier25
        default: return tier1
        }
    }
}

// Internal hex helper. Kept as a Color initializer (rather than on
// BBNColors) so ad-hoc one-off colors inside the dashboard module can
// still use the same shorthand without re-exporting a competing
// `Color.bbn*` extension surface. Named `bbnHex:` so it never collides
// with any other module that might define its own `Color(hex:)` init.
extension Color {
    init(bbnHex hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xff) / 255
        let g = Double((hex >> 8)  & 0xff) / 255
        let b = Double(hex & 0xff) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
