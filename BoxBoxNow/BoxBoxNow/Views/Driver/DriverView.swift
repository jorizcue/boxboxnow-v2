import SwiftUI

struct DriverView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var raceVM: RaceViewModel
    @EnvironmentObject var configVM: ConfigViewModel
    @EnvironmentObject var gpsVM: GPSViewModel
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var speech = DriverSpeechService()
    @State private var showMenu = false
    @State private var lapDelta: String? = nil // "faster" | "slower"
    @State private var prevLapMs: Double = 0
    @State private var previousBrightness: CGFloat = 0.5
    @State private var cardsAppeared = false

    /// Whether the current user has permission to view BOX-group cards.
    /// Admins always can. Otherwise the `app-config-box` tab must be granted.
    /// When false, we drop every card whose group is `.box` from the driver
    /// view regardless of what visibleCards / presets have saved, so a pilot
    /// without box permissions never sees pit-related data.
    private var canShowBoxCards: Bool {
        if auth.user?.isAdmin == true { return true }
        return auth.user?.tabAccess?.contains("app-config-box") == true
    }

    var body: some View {
        // TimelineView ticks every second, giving us a smooth clock
        // without relying on ViewModel timers that SwiftUI can't observe.
        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let now = timeline.date
            let clockMs = raceVM.interpolatedClockMs(at: now)

            GeometryReader { geo in
                let isLandscape = geo.size.width > geo.size.height
                let numCols = isLandscape ? 3 : 2
                // Hide BOX cards entirely when the user lacks pit permissions,
                // even if a preset or saved config marks them visible.
                let cards = driverVM.orderedVisibleCards.filter { card in
                    canShowBoxCards || card.group != .box
                }
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
                                    ForEach(Array(cards.enumerated()), id: \.element.id) { idx, card in
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
                                        .opacity(cardsAppeared ? 1 : 0)
                                        .offset(y: cardsAppeared ? 0 : 12)
                                        .animation(
                                            .easeOut(duration: 0.3).delay(Double(idx) * 0.04),
                                            value: cardsAppeared
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

                    // Indicators (top-left audio, right-center menu handle)
                    if !showMenu {
                        VStack {
                            HStack {
                                // Audio indicator
                                if speech.enabled {
                                    Image(systemName: "speaker.wave.2.fill")
                                        .font(.system(size: 12))
                                        .foregroundColor(.accentColor)
                                        .padding(6)
                                        .background(Color.black.opacity(0.6))
                                        .clipShape(Circle())
                                        .padding(.leading, 12)
                                        .padding(.top, 8)
                                }
                                Spacer()
                            }
                            Spacer()
                        }
                        .allowsHitTesting(false)

                        // Menu handle (right edge, vertically centered)
                        HStack {
                            Spacer()
                            VStack(spacing: 3) {
                                ForEach(0..<3, id: \.self) { _ in
                                    RoundedRectangle(cornerRadius: 1)
                                        .fill(Color.white.opacity(0.3))
                                        .frame(width: 4, height: 4)
                                }
                            }
                            .padding(.vertical, 12)
                            .padding(.horizontal, 4)
                            .background(
                                Capsule()
                                    .fill(Color.white.opacity(0.08))
                            )
                            .padding(.trailing, 2)
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

                    // IMU calibration banner removed per product request —
                    // the pilot view should be a clean card grid on entry.
                    // Calibration is still available from the driver menu.

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
            previousBrightness = UIScreen.main.brightness
            UIScreen.main.brightness = 1.0
            UIApplication.shared.isIdleTimerDisabled = true
            // Apply orientation lock chosen by the user
            OrientationManager.shared.apply(driverVM.orientationLock)
            // Fetch presets and auto-apply the default one if the user
            // marked one as "predefinida" (from web or from the iOS
            // presets screen). This runs every time the driver view is
            // opened so the pilot always lands on the expected layout.
            Task { await driverVM.applyDefaultPresetIfAny() }
            // Staggered card entrance
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                cardsAppeared = true
            }
        }
        .onDisappear {
            raceVM.disconnect()
            // Restore previous brightness + allow screen sleep
            UIScreen.main.brightness = previousBrightness
            UIApplication.shared.isIdleTimerDisabled = false
            // Release orientation lock so the rest of the app can rotate freely
            OrientationManager.shared.lock(.all)
        }
        .onChange(of: driverVM.orientationLock) { _, newValue in
            OrientationManager.shared.apply(newValue)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            // Re-sync state when returning from background (may have missed
            // replay start, box calls, or race updates while suspended)
            raceVM.requestSnapshot()
        }
        .onChange(of: myKart?.lastLapMs) {
            detectLapDelta()
            // Haptic on new lap
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
        .onChange(of: ourKartNumber) {
            prevLapMs = 0
            lapDelta = nil
            speech.reset()
        }
        .onChange(of: raceVM.boxCallActive) {
            if raceVM.boxCallActive {
                // Heavy haptic for BOX call
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
                DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                    raceVM.boxCallActive = false
                }
            }
        }
        .onChange(of: raceVM.karts.first(where: { $0.kartNumber == ourKartNumber })?.pitStatus) {
            // Haptic when pit status changes
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
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

    @ViewBuilder
    private var calibrationBanner: some View {
        let phase = gpsVM.calibrator.phase
        HStack(spacing: 10) {
            switch phase {
            case .idle:
                Image(systemName: "gyroscope")
                    .foregroundColor(.black)
                Text("IMU sin calibrar")
                    .font(.caption.bold())
                    .foregroundColor(.black)
                Spacer()
                Button("Calibrar") {
                    gpsVM.calibrator.startCalibration()
                }
                .font(.caption.bold())
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color.black.opacity(0.2))
                .foregroundColor(.black)
                .cornerRadius(12)

            case .sampling:
                ProgressView()
                    .tint(.white)
                    .scaleEffect(0.7)
                Text("Calibrando... \(Int(gpsVM.calibrator.progress * 100))%")
                    .font(.caption.bold())
                    .foregroundColor(.white)
                Spacer()
                ProgressView(value: gpsVM.calibrator.progress)
                    .tint(.white)
                    .frame(width: 60)

            case .ready:
                Image(systemName: "car.fill")
                    .foregroundColor(.black)
                Text("Conduce >15 km/h")
                    .font(.caption.bold())
                    .foregroundColor(.black)
                Spacer()
                Button("Omitir") {
                    gpsVM.calibrator.skipAlignment()
                }
                .font(.caption.bold())
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color.black.opacity(0.2))
                .foregroundColor(.black)
                .cornerRadius(12)

            case .aligned:
                EmptyView()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(calibrationBannerColor.opacity(0.9))
        .cornerRadius(20)
        .padding(.horizontal, 20)
    }

    private var calibrationBannerColor: Color {
        switch gpsVM.calibrator.phase {
        case .idle: return .yellow
        case .sampling: return .blue
        case .ready: return .cyan
        case .aligned: return .green
        }
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
