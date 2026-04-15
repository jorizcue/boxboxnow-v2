import SwiftUI

/// Chronological list of the 30 most recent pit stops across the entire field,
/// sorted by descending `raceTimeMs` (most recent first). The parent flattens
/// `RaceStore.karts.flatMap(\.pitHistory)` into these entries.
struct PitHistoryListView: View {
    struct Entry: Identifiable {
        let id: String
        let kartNumber: Int
        let driverName: String
        let lap: Int
        let pitTimeMs: Double
        let raceTimeMs: Double
    }

    let entries: [Entry]

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Historial reciente")
                    .font(BBNTypography.title3)
                    .foregroundStyle(BBNColors.textPrimary)

                if entries.isEmpty {
                    Text("Sin pits registrados")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(entries) { entry in
                        HStack(spacing: 12) {
                            KartNumberBadge(number: entry.kartNumber, size: 36)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.driverName)
                                    .font(BBNTypography.body)
                                    .foregroundStyle(BBNColors.textPrimary)
                                Text("Vuelta \(entry.lap)")
                                    .font(BBNTypography.caption)
                                    .foregroundStyle(BBNColors.textMuted)
                            }

                            Spacer()

                            Text(RaceFormatters.lapTime(ms: entry.pitTimeMs))
                                .font(BBNTypography.bodyBold)
                                .monospacedDigit()
                                .foregroundStyle(BBNColors.textPrimary)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 12)
                        .background(BBNColors.background)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(rowLabel(for: entry))
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(entries.isEmpty ? "Historial reciente, vacío" : "Historial reciente, \(entries.count) paradas")
        }
    }

    private func rowLabel(for entry: Entry) -> String {
        "Kart \(entry.kartNumber), \(entry.driverName), vuelta \(entry.lap), parada de \(RaceFormatters.lapTime(ms: entry.pitTimeMs))"
    }
}
