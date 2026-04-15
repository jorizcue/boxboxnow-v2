import SwiftUI

struct BBNStatusDot: View {
    let isOn: Bool
    let label: String
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(isOn ? Color.bbnSuccess : Color.bbnDanger)
                .frame(width: 8, height: 8)
                .scaleEffect(isOn ? 1 : (pulse ? 1.2 : 0.9))
                .animation(isOn ? .default : .easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: pulse)
            Text(label).font(.bbnCaption).foregroundColor(.bbnTextMuted)
        }
        .onAppear { pulse = true }
    }
}
