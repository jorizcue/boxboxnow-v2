import SwiftUI

struct RaceView: View {
    @Environment(AppStore.self) private var app
    @State private var selected: KartStateFull? = nil

    var body: some View {
        VStack(spacing: 0) {
            // Always render the info panel (matches web). Cards show "—" when
            // there's no data yet rather than the whole row disappearing, so
            // the layout doesn't jump on the first snapshot.
            RaceInfoPanel()
            RaceTableHeader()
            if app.race.karts.isEmpty {
                PlaceholderView(text: "Esperando datos de la carrera…")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(sortedKarts) { kart in
                            RaceRowView(
                                kart: kart,
                                config: app.race.config,
                                liveStintSec: stintSeconds(for: kart),
                                onTap: { selected = kart }
                            )
                        }
                    }
                }
            }
        }
        .background(BBNColors.background)
        .sheet(item: $selected) { kart in
            KartDetailSheet(kart: kart)
        }
    }

    /// Sort by MED.20 (avgLapMs) ascending — matches the web `RaceTable`
    /// default ordering. Karts with no recorded average sort to the end via
    /// `Double.infinity`.
    private var sortedKarts: [KartStateFull] {
        app.race.karts.sorted { a, b in
            let av = (a.base.avgLapMs ?? 0) > 0 ? a.base.avgLapMs! : .infinity
            let bv = (b.base.avgLapMs ?? 0) > 0 ? b.base.avgLapMs! : .infinity
            if av == bv { return a.base.position < b.base.position }
            return av < bv
        }
    }

    /// Live-ticking stint seconds for a given kart — reads the same
    /// interpolated race clock the info panel uses, so every row advances
    /// every second between server snapshots.
    private func stintSeconds(for kart: KartStateFull) -> Double {
        let clock = app.race.interpolatedCountdownMs
        if clock <= 0 || app.race.raceFinished { return 0 }
        let start = kart.base.stintStartCountdownMs ?? (app.race.durationMs > 0 ? app.race.durationMs : clock)
        return max(0, (start - clock) / 1000)
    }
}
