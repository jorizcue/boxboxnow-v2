import SwiftUI

struct BBNLoadingOverlay: View {
    let isVisible: Bool
    var message: String? = nil

    var body: some View {
        if isVisible {
            ZStack {
                Color.black.opacity(0.5).ignoresSafeArea()
                VStack(spacing: 12) {
                    ProgressView().tint(.bbnAccent).scaleEffect(1.5)
                    if let message { Text(message).font(.bbnBody).foregroundColor(.bbnTextMuted) }
                }
                .padding(32)
                .background(Color.bbnCard)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.bbnBorder, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .transition(.opacity)
        }
    }
}
