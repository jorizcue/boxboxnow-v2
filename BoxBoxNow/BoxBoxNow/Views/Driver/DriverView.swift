import SwiftUI

struct DriverView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var raceVM: RaceViewModel
    @EnvironmentObject var configVM: ConfigViewModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var speech = DriverSpeechService()
    @State private var showMenu = false
    @State private var lapDelta: String? = nil // "faster" | "slower"
    @State private var prevLapMs: Double = 0
    @State private var previousBrightness: CGFloat = 0.5

    var body: some View {
        // TimelineView ticks every second, giving us a smooth clock
        // without relying on ViewModel timers that SwiftUI can't observe.
        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let now = timeline.date
            let clockMs = raceVM.interpolatedClockMs(at: now)

            GeometryReader { geo in
                let isLandscape = geo.size.width > geo.size.height
                let numCols = isLandscape ? 3 : 2
                let cards = driverVM.orderedVisibleCards
                let numRows = (cards.count + numCols - 1) / numCols
                let spacing: CGFloat = 6
                // Use safe area insets so cards don't clip behind rounded corners
                let safeTop = max(6, geo.safeAreaInsets.top)
                let safeBottom = max(6, geo.safeAreaInsets.bottom)
                let safeLeading = max(6, geo.safeAreaInsets.leading)
                let safeTrailing = max(6, geo.safeAreaInsets.trailing)

                // Calculate card height to fill the screen
                let totalVerticalSpacing = spacing * CGFloat(max(0, numRows - 1))
                let availableHeight = geo.size.height - safeTop - safeBottom - totalVerticalSpacing
                let cardHeight = numRows > 0 ? max(60, availableHeight / CGFloat(numRows)) : 90

                let columns = Array(repeating: GridItem(.flexible(), spacing: spacing),
                                    count: numCols)

                ZStack {
                    Color.black.ignoresSafeArea()

                    if !raceVM.isConnected && raceVM.karts.isEmpty {
                        VStack(spacing: 12) {
                            ProgressView()
                                .tint(.accentColor)
                            Text("Conectando...")
                                .foregroundColor(.gray)
                                .font(.caption)
                        }
                    } else {
                        // Card grid with contrast/brightness filter applied
                        Group {
                            if numRows > 0 && availableHeight / CGFloat(numRows) >= 60 {
                                LazyVGrid(columns: columns, spacing: spacing) {
                                    ForEach(cards) { card in
                                        DriverCardView(
                                            card: card,
                                            kart: myKart,
                                            raceVM: raceVM,
                                            ourKartNumber: ourKartNumber,
                                            gps: driverVM.gpsData,
                                            lapDelta: lapDelta,
                                            cardHeight: cardHeight,
                                            clockMs: clockMs,
                                            lapTracker: driverVM.lapTracker
                                        )
                                    }
                                }
                                .padding(.top, safeTop)
                                .padding(.bottom, safeBottom)
                                .padding(.leading, safeLeading)
                                .padding(.trailing, safeTrailing)
                            } else {
                                ScrollView {
                                    LazyVGrid(columns: columns, spacing: spacing) {
                                        ForEach(cards) { card in
                                            DriverCardView(
                                                card: card,
                                                kart: myKart,
                                                raceVM: raceVM,
                                                ourKartNumber: ourKartNumber,
                                                gps: driverVM.gpsData,
                                                lapDelta: lapDelta,
                                                cardHeight: 90,
                                                clockMs: clockMs,
                                                lapTracker: driverVM.lapTracker
                                            )
                                        }
                                    }
                                    .padding(.top, safeTop)
                                    .padding(.bottom, safeBottom)
                                    .padding(.leading, safeLeading)
                                    .padding(.trailing, safeTrailing)
                                }
                            }
                        }
                        .brightness(contrastToBrightness)
                        .contrast(contrastToContrast)
                        .saturation(contrastToSaturation)
                    }

                    if showMenu {
                        DriverMenuOverlay(speech: speech, isPresented: $showMenu, onDismiss: { dismiss() })
                    }

                    // Audio indicator (top-left when menu is hidden)
                    if speech.enabled && !showMenu {
                        VStack {
                            HStack {
                                Image(systemName: "speaker.wave.2.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(.accentColor)
                                    .padding(6)
                                    .background(Color.black.opacity(0.6))
                                    .clipShape(Circle())
                                    .padding(.leading, 12)
                                    .padding(.top, 8)
                                Spacer()
                            }
                            Spacer()
                        }
                        .allowsHitTesting(false)
                    }

                    // ── Connection lost banner ──
                    if !raceVM.isConnected && !raceVM.karts.isEmpty {
                        VStack {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .tint(.white)
                                    .scaleEffect(0.8)
                                Text("Reconectando...")
                                    .font(.caption.bold())
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color.red.opacity(0.85))
                            .cornerRadius(20)
                            .padding(.top, safeTop + 4)
                            Spacer()
                        }
                        .allowsHitTesting(false)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .animation(.easeInOut(duration: 0.3), value: raceVM.isConnected)
                        .accessibilityLabel("Conexion perdida, reconectando")
                    }

                    // ── BOX CALL overlay (full-screen red flash) ──
                    if raceVM.boxCallActive {
                        BoxCallOverlay {
                            raceVM.boxCallActive = false
                        }
                    }
                }
                .onTapGesture {
                    if raceVM.boxCallActive {
                        raceVM.boxCallActive = false
                    } else {
                        withAnimation { showMenu.toggle() }
                    }
                }
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
            }
        }
        .ignoresSafeArea()
        .task {
            await configVM.loadSession()
            if raceVM.ourKartNumber == 0 {
                raceVM.ourKartNumber = configVM.session.ourKartNumber
            }
            syncConfigToRaceVM()
        }
        .onAppear {
            raceVM.connect()
            // Max brightness + keep screen on for driver view
            previousBrightness = UIScreen.main.brightness
            UIScreen.main.brightness = 1.0
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear {
            raceVM.disconnect()
            // Restore previous brightness + allow screen sleep
            UIScreen.main.brightness = previousBrightness
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .onChange(of: myKart?.lastLapMs) {
            detectLapDelta()
        }
        .onChange(of: ourKartNumber) {
            prevLapMs = 0
            lapDelta = nil
            speech.reset()
        }
        .onChange(of: raceVM.boxCallActive) {
            if raceVM.boxCallActive {
                // Auto-dismiss after 30 seconds (matching web)
                DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                    raceVM.boxCallActive = false
                }
            }
        }
    }

    private var ourKartNumber: Int {
        raceVM.ourKartNumber > 0 ? raceVM.ourKartNumber : configVM.session.ourKartNumber
    }

    private var myKart: KartState? {
        raceVM.karts.first(where: { $0.kartNumber == ourKartNumber })
    }

    // Contrast slider (0.0 = normal, 1.0 = max boost) -> mapped to SwiftUI modifiers
    private var contrastToBrightness: Double {
        driverVM.brightness * 0.15
    }
    private var contrastToContrast: Double {
        1.0 + driverVM.brightness * 0.8
    }
    private var contrastToSaturation: Double {
        1.0 + driverVM.brightness * 0.5
    }

    private func syncConfigToRaceVM() {
        let s = configVM.session
        if raceVM.durationMin == 0 { raceVM.durationMin = Double(s.durationMin) }
        if raceVM.minPits == 0 { raceVM.minPits = s.minPits }
        if raceVM.pitTimeS == 0 { raceVM.pitTimeS = Double(s.pitTimeS) }
        if raceVM.maxStintMin == 0 { raceVM.maxStintMin = Double(s.maxStintMin) }
        if raceVM.minStintMin == 0 { raceVM.minStintMin = Double(s.minStintMin) }
        if raceVM.minDriverTimeMin == 0 { raceVM.minDriverTimeMin = Double(s.minDriverTimeMin) }
    }

    private func detectLapDelta() {
        guard let kart = myKart, let lastMs = kart.lastLapMs, lastMs > 0 else { return }
        if prevLapMs > 0 {
            // Color persists until next lap (matching web usePrevLap hook)
            lapDelta = lastMs < prevLapMs ? "faster" : "slower"
        }
        prevLapMs = lastMs

        // Trigger audio narration (matching web useDriverSpeech)
        let pos = raceVM.racePosition(ourKartNumber: ourKartNumber)
        let stintCalc = raceVM.computeStintCalc(ourKartNumber: ourKartNumber, clockMs: 0)
        speech.speakLapData(
            lastLapMs: lastMs,
            prevLapMs: prevLapMs,
            lapDelta: lapDelta,
            realPosition: pos?.pos,
            totalKarts: pos?.total,
            boxScore: raceVM.boxScore,
            lapsToMaxStint: stintCalc.lapsToMax
        )
    }
}
