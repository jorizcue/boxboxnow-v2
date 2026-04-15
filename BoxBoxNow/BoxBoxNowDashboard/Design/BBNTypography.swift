import SwiftUI

// Typography tokens for the dashboard app.
//
// Call-site convention: use the `BBNTypography.*` namespace. Tasks 14+
// call sites assume this shape.
//
// For monospaced tabular numerics (lap times, positions, kart numbers)
// consumers should apply the `.monospacedDigit()` modifier to an existing
// token rather than defining a separate mono font token. Example:
//
//     Text(lap).font(BBNTypography.body).monospacedDigit()
//
// This is cheaper than maintaining parallel mono variants of every token
// and it honors the user's preferred digit width (SF's tabular figures).
//
// Accessibility note: all tokens use fixed point sizes rather than the
// system text styles (`.body`, `.title2`, …) so the dashboard is pinned
// to an iPad-sized design. A future accessibility pass will add Dynamic
// Type support; avoid referencing these tokens from scalable contexts
// until then.
enum BBNTypography {
    static let title1   = Font.system(size: 32, weight: .bold,     design: .default)
    static let title2   = Font.system(size: 22, weight: .semibold, design: .default)
    static let title3   = Font.system(size: 17, weight: .semibold, design: .default)
    static let body     = Font.system(size: 15, weight: .regular,  design: .default)
    static let bodyBold = Font.system(size: 15, weight: .semibold, design: .default)
    static let caption  = Font.system(size: 12, weight: .regular,  design: .default)
}
