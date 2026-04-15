import SwiftUI

struct BoxCallOverlay: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        if app.race.boxCallActive {
            ZStack {
                BBNColors.danger.ignoresSafeArea()
                VStack(spacing: 20) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 120, weight: .bold))
                    Text("BOX BOX BOX")
                        .font(.system(size: 96, weight: .black, design: .rounded))
                }
                .foregroundStyle(.white)
            }
            .transition(.opacity)
            .onTapGesture { app.race.clearBoxCall() }
        }
    }
}
