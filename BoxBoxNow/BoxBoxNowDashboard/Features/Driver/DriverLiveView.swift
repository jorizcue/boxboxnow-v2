import SwiftUI

/// Full-screen driver live view — always renders the configured card grid,
/// mirroring the web `DriverView` which shows empty cards (value = "—")
/// when the session has no karts yet instead of a "waiting for data"
/// placeholder.
///
/// Card selection comes from the user's `DriverPreferences`; if those are
/// empty, the whole canonical catalog is shown. A box-call overlay flashes
/// when `RaceStore.boxCallActive` is true, matching the web's full-screen
/// "BOX BOX BOX" notification. `countdownMs` is interpolated client-side
/// between server snapshots (~30s apart) so the race timer ticks smoothly.
///
/// A small header strip shows the configured kart number ("K1", "K7", …)
/// so the user always knows which kart's data they're looking at, same as
/// the web's "K{n}" header in the pilot view.
struct DriverLiveView: View {
    @Environment(AppStore.self) private var app
    @State private var interpolatedCountdown: Double = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                headerBar
                DriverGridView(
                    cardIds: visibleCardIds,
                    kart: ourKart,
                    countdownMs: interpolatedCountdown,
                    fifoScore: app.race.fifo.score,
                    minPits: app.race.config?.minPits ?? 0,
                    pitTimeS: app.race.config?.pitTimeS ?? 0,
                    durationMs: app.race.durationMs
                )
            }

            // Box-call overlay (flashes full-screen on BOX event)
            if app.race.boxCallActive {
                boxCallOverlay
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .task { await tickCountdown() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Vista en vivo del piloto")
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(spacing: 10) {
            // Small status dot + kart label, echoing web's "K{n}" chip
            Circle()
                .fill(app.race.isConnected ? BBNColors.success : BBNColors.danger)
                .frame(width: 8, height: 8)
            Spacer()
            Text(kartLabel)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(BBNColors.textMuted)
            Spacer()
            // Right-side spacer so the kart label stays centered even with
            // the status dot on the left.
            Color.clear.frame(width: 8, height: 8)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
    }

    private var kartLabel: String {
        if let num = app.race.config?.ourKartNumber, num > 0 {
            return "K\(num)"
        }
        return "—"
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
    /// when preferences are empty or absent (matches web fallback).
    private var visibleCardIds: [String] {
        guard let prefs = app.config.preferences,
              !prefs.cardOrder.isEmpty else {
            return DriverCardCatalog.allIds
        }
        let filtered = prefs.cardOrder.filter { prefs.visibleCards[$0] == true }
        return filtered.isEmpty ? DriverCardCatalog.allIds : filtered
    }

    // MARK: - Our kart lookup

    /// The kart matching the user's configured kart number, or nil when
    /// none is configured / the race hasn't started. `DriverCardView`
    /// handles nil by rendering "—" placeholders, matching the web.
    private var ourKart: KartStateFull? {
        guard let num = app.race.config?.ourKartNumber, num > 0 else { return nil }
        return app.race.karts.first { $0.base.kartNumber == num }
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
                lastServerValue = currentServer
                lastServerTime = Date()
            } else if Date().timeIntervalSince(lastServerTime) > 60 {
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
