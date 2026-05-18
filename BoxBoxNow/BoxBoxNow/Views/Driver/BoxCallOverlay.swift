import SwiftUI

/// Full-screen red flashing overlay shown when the web dashboard
/// sends a "call to BOX" alert. Matches the web's `boxFlash` animation.
/// Tap anywhere to dismiss.
struct BoxCallOverlay: View {
    var onDismiss: () -> Void
    @EnvironmentObject var langStore: LanguageStore
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

                Text(t("boxCall.tapToClose"))
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

/// Full-screen overlay for a free-text message the strategist sends from
/// the web. White background, large bold black text so it's readable at
/// a glance on track. Tap anywhere to dismiss. Mirrors `BoxCallOverlay`.
struct DriverMessageOverlay: View {
    let text: String
    var onDismiss: () -> Void
    @EnvironmentObject var langStore: LanguageStore

    var body: some View {
        ZStack {
            Color.white
                .ignoresSafeArea()

            VStack(spacing: 24) {
                Text(text)
                    .font(.system(size: 80, weight: .black))
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.3)
                    .lineLimit(6)
                    .padding(.horizontal, 24)

                Text(t("boxCall.tapToClose"))
                    .font(.subheadline)
                    .foregroundColor(.black.opacity(0.5))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction { onDismiss() }
        .onTapGesture { onDismiss() }
        .transition(.opacity)
    }
}
