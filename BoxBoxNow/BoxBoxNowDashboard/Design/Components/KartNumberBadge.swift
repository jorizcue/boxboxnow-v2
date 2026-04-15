import SwiftUI

/// Circular kart number badge used in race tables and pit displays.
struct KartNumberBadge: View {
    let number: Int
    var size: CGFloat = 32

    var body: some View {
        Text("\(number)")
            .font(.system(size: size * 0.45, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(BBNColors.textPrimary)
            .frame(width: size, height: size)
            .background(BBNColors.surface)
            .clipShape(Circle())
            .overlay(Circle().stroke(BBNColors.border, lineWidth: 1))
    }
}
