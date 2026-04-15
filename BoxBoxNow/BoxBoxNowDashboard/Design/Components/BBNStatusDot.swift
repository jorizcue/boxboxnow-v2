import SwiftUI

struct BBNStatusDot: View {
    let isOn: Bool
    let label: String
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(isOn ? BBNColors.success : BBNColors.danger)
                .frame(width: 8, height: 8)
                // Only the off-state pulses. Two separate `.animation`
                // modifiers: one keyed on `pulse` to drive the repeating
                // pulse while isOn is false, and one keyed on `isOn`
                // itself so toggling isOn re-evaluates the scale and
                // cleanly settles into `1.0` without carrying a stale
                // repeatForever handle across the transition.
                .scaleEffect(isOn ? 1.0 : (pulse ? 1.2 : 0.9))
                .animation(
                    isOn ? nil : .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
                    value: pulse
                )
                .animation(.default, value: isOn)
            Text(label).font(BBNTypography.caption).foregroundColor(BBNColors.textMuted)
        }
        .onAppear { pulse = true }
    }
}
