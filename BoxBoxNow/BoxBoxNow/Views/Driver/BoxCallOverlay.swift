import SwiftUI

/// Full-screen red flashing overlay shown when the web dashboard
/// sends a "call to BOX" alert. Matches the web's `boxFlash` animation.
/// Tap anywhere to dismiss.
struct BoxCallOverlay: View {
    var onDismiss: () -> Void
    @State private var flash = false

    var body: some View {
        ZStack {
            // Flashing red background (bright ↔ dim, 0.5s period)
            Color.red
                .opacity(flash ? 1.0 : 0.3)
                .ignoresSafeArea()
                .animation(
                    .easeInOut(duration: 0.5).repeatForever(autoreverses: true),
                    value: flash
                )

            VStack(spacing: 16) {
                Text("BOX")
                    .font(.system(size: 120, weight: .black))
                    .foregroundColor(.white)
                    .shadow(color: .red, radius: 40)

                Text("Toca para cerrar")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Alerta: ir a boxes")
        .accessibilityAddTraits(.isModal)
        .accessibilityAction { onDismiss() }
        .onAppear { flash = true }
        .onTapGesture { onDismiss() }
        .transition(.opacity)
    }
}
