import SwiftUI

extension Font {
    static let bbnDisplay   = Font.system(size: 32, weight: .bold, design: .default)
    static let bbnTitle     = Font.system(size: 22, weight: .semibold, design: .default)
    static let bbnHeadline  = Font.system(size: 17, weight: .semibold, design: .default)
    static let bbnBody      = Font.system(size: 15, weight: .regular, design: .default)
    static let bbnCaption   = Font.system(size: 12, weight: .regular, design: .default)

    // Monospaced — for lap times, positions, kart numbers
    static let bbnMono       = Font.system(size: 15, weight: .regular, design: .monospaced)
    static let bbnMonoLarge  = Font.system(size: 24, weight: .semibold, design: .monospaced)
    static let bbnMonoHuge   = Font.system(size: 48, weight: .bold, design: .monospaced)
}
