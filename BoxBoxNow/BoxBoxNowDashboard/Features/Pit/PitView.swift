import SwiftUI

struct PitView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                FifoQueueView(state: app.race.fifo)
                InPitListView(karts: inPitKarts)
                PitHistoryListView(entries: historyEntries)
            }
            .padding(20)
        }
        .background(BBNColors.background)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Boxes")
    }

    private var inPitKarts: [KartStateFull] {
        app.race.karts
            .filter { $0.base.isInPit }
            .sorted { $0.base.position < $1.base.position }
    }

    /// Flatten the latest 30 pit stops across the entire field, most recent
    /// first. We sort by descending `raceTimeMs` because `PitRecord` has no
    /// wall-clock timestamp — the race clock is shared across all karts so
    /// it gives a consistent chronological ordering.
    private var historyEntries: [PitHistoryListView.Entry] {
        let flat = app.race.karts.flatMap { kart -> [PitHistoryListView.Entry] in
            kart.pitHistory.map { record in
                PitHistoryListView.Entry(
                    id: "\(kart.base.kartNumber)-\(record.pitNumber)",
                    kartNumber: kart.base.kartNumber,
                    driverName: record.driverName,
                    lap: record.lap,
                    pitTimeMs: record.pitTimeMs,
                    raceTimeMs: record.raceTimeMs
                )
            }
        }
        return Array(flat.sorted { $0.raceTimeMs > $1.raceTimeMs }.prefix(30))
    }
}
