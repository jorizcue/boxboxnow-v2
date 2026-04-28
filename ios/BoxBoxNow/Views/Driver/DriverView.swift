import SwiftUI

struct DriverView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var raceVM: RaceViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showMenu = false

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let columns = Array(repeating: GridItem(.flexible(), spacing: 8),
                                count: isLandscape ? 3 : 2)

            ZStack {
                Color.black.ignoresSafeArea()

                // Pit-in-progress replaces the card grid while our kart is pitting
                if myKart?.isInPit == true {
                    PitInProgressView(kart: myKart)
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(driverVM.orderedVisibleCards) { card in
                                DriverCardView(
                                    card: card,
                                    kart: myKart,
                                    gps: driverVM.gpsData,
                                    driverVM: driverVM
                                )
                            }
                        }
                        .padding(8)
                    }
                }

                if showMenu {
                    DriverMenuOverlay(isPresented: $showMenu, onDismiss: { dismiss() })
                }

                // Full-screen BOX call overlay (auto-dismisses after 5 s)
                if raceVM.boxCallActive {
                    BoxCallOverlayView {
                        raceVM.clearBoxCall()
                    }
                }
            }
            .onTapGesture {
                if raceVM.boxCallActive {
                    raceVM.clearBoxCall()
                } else {
                    showMenu.toggle()
                }
            }
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)
        }
    }

    private var myKart: KartState? {
        // TODO: determine user's kart number
        raceVM.karts.first
    }
}

// MARK: - Box Call Overlay

private struct BoxCallOverlayView: View {
    var onDismiss: () -> Void
    @State private var flashAlpha: Double = 0.3

    var body: some View {
        ZStack {
            Color.red
                .opacity(flashAlpha)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Text("BOX")
                    .font(.system(size: 120, weight: .black))
                    .foregroundColor(.white)
                Text("Toca para cerrar")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.7))
                Text("Se cierra automáticamente")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .onTapGesture { onDismiss() }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) {
                flashAlpha = 1.0
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            onDismiss()
        }
    }
}

// MARK: - Pit In Progress

private struct PitInProgressView: View {
    let kart: KartState?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 20) {
                Text("PIT")
                    .font(.system(size: 90, weight: .black, design: .monospaced))
                    .foregroundColor(.green)

                Text("EN CURSO")
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.55))
                    .kerning(6)

                if let k = kart, k.pitStops > 0 {
                    Text("PARADA #\(k.pitStops)")
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .foregroundColor(Color.green.opacity(0.75))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(8)
                }
            }
        }
    }
}
