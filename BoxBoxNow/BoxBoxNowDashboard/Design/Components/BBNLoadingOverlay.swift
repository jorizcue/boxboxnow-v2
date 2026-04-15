import SwiftUI

struct BBNLoadingOverlay: View {
    let isVisible: Bool
    var message: String? = nil

    // The overlay is rendered unconditionally and faded via `.opacity` +
    // `.animation(value:)` so call sites don't need to remember to wrap
    // their state mutation in `withAnimation { ... }`. A conditional
    // `if isVisible { ... }` + `.transition(.opacity)` would only animate
    // when the parent explicitly drives the transition, which we do not
    // want to require from every consumer. `.allowsHitTesting(false)`
    // when hidden keeps the invisible overlay from swallowing taps.
    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView().tint(BBNColors.accent).scaleEffect(1.5)
                if let message {
                    Text(message).font(BBNTypography.body).foregroundColor(BBNColors.textMuted)
                }
            }
            .padding(32)
            .background(BBNColors.card)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(BBNColors.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .opacity(isVisible ? 1 : 0)
        .allowsHitTesting(isVisible)
        .animation(.default, value: isVisible)
    }
}
