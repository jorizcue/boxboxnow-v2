import SwiftUI

/// Full-screen driver live view — a responsive card grid showing real-time
/// race data for "our kart" (the kart configured in the active session).
///
/// Card selection comes from the user's `DriverPreferences` stored on
/// `ConfigStore.preferences`. If preferences are empty (new user), all
/// cards in `DriverCardCatalog`'s canonical order are shown.
///
/// A box-call overlay flashes when `RaceStore.boxCallActive` is true,
/// matching the web's full-screen "BOX BOX BOX" notification.
///
/// The view interpolates `countdownMs` client-side between server snapshots
/// (which arrive every ~30s) so the race timer ticks smoothly.
struct DriverLiveView: View {
    @Environment(AppStore.self) private var app
    @State private var interpolatedCountdown: Double = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let kart = ourKart {
                DriverGridView(
                    cardIds: visibleCardIds,
                    kart: kart,
                    countdownMs: interpolatedCountdown
                )
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "car.side")
                        .font(.system(size: 48))
                        .foregroundStyle(BBNColors.textMuted)
                    Text(noKartMessage)
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                        .multilineTextAlignment(.center)
                }
            }

            // Box-call overlay
            if app.race.boxCallActive {
                boxCallOverlay
            }
        }
        .ignoresSafeArea(edges: .all)
        .task { await tickCountdown() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Vista en vivo del piloto")
    }

    // MARK: - Box-call overlay

    private var boxCallOverlay: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()
            VStack(spacing: 20) {
                Text("BOX BOX BOX")
                    .font(.system(size: 64, weight: .black))
                    .foregroundStyle(BBNColors.accent)
                Text("ENTRA A BOXES")
                    .font(BBNTypography.title2)
                    .foregroundStyle(BBNColors.textMuted)
            }
        }
        .transition(.opacity)
        .accessibilityLabel("Alerta de box activa")
    }

    // MARK: - Card selection

    /// Returns the list of card IDs the user has configured as visible,
    /// in their chosen order. Falls back to the full canonical catalog
    /// when preferences are empty or absent.
    private var visibleCardIds: [String] {
        guard let prefs = app.config.preferences,
              !prefs.cardOrder.isEmpty else {
            return DriverCardCatalog.allIds
        }
        let filtered = prefs.cardOrder.filter { prefs.visibleCards[$0] == true }
        return filtered.isEmpty ? DriverCardCatalog.allIds : filtered
    }

    // MARK: - Our kart lookup

    private var ourKart: KartStateFull? {
        guard let num = app.race.config?.ourKartNumber, num > 0 else { return nil }
        return app.race.karts.first { $0.base.kartNumber == num }
    }

    private var noKartMessage: String {
        if app.race.karts.isEmpty {
            return "Esperando datos de carrera…\nConecta al WebSocket para empezar."
        }
        if app.race.config?.ourKartNumber == nil || app.race.config?.ourKartNumber == 0 {
            return "No tienes un kart asignado.\nConfigura tu nº de kart en la sesión."
        }
        return "Tu kart no aparece en la carrera actual."
    }

    // MARK: - Countdown interpolation

    /// Client-side interpolation of `countdownMs` so the race timer ticks
    /// smoothly between server snapshots (~30s apart). Stores the last known
    /// server value and the wall-clock time it arrived, then subtracts
    /// elapsed wall-clock time. Resets when the server sends a new value.
    ///
    /// If no new server value arrives in 60s (race paused or WS stalled),
    /// the display freezes at the last interpolated value instead of
    /// continuing to subtract wall time — prevents unbounded drift.
    private func tickCountdown() async {
        var lastServerValue = app.race.countdownMs
        var lastServerTime = Date()
        interpolatedCountdown = lastServerValue

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 200_000_000) // 200ms = 5Hz

            let currentServer = app.race.countdownMs
            if currentServer != lastServerValue {
                // Server sent a new snapshot — recalibrate
                lastServerValue = currentServer
                lastServerTime = Date()
            } else if Date().timeIntervalSince(lastServerTime) > 60 {
                // No server update in 60s — likely paused. Freeze display.
                interpolatedCountdown = max(0, lastServerValue)
                continue
            }

            if currentServer == 0 {
                interpolatedCountdown = 0
                continue
            }

            let wallElapsed = Date().timeIntervalSince(lastServerTime) * 1000
            interpolatedCountdown = max(0, lastServerValue - wallElapsed)
        }
    }
}
