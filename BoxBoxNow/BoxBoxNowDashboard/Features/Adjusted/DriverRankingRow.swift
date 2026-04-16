import SwiftUI

/// Row for the "Clasif. Real Beta" view. Driver-centric — one row per
/// (kart, driver) combination, showing per-driver average lap and total time.
struct DriverRankingRow: View {
    let ranking: DriverRanking

    var body: some View {
        HStack(spacing: 12) {
            Text("\(ranking.position)º")
                .font(BBNTypography.bodyBold)
                .foregroundStyle(BBNColors.textPrimary)
                .monospacedDigit()
                .frame(width: 48, alignment: .leading)

            KartNumberBadge(number: ranking.kartNumber, size: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(ranking.driverName)
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                if !ranking.teamName.isEmpty {
                    Text(ranking.teamName)
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(RaceFormatters.lapTime(ms: ranking.avgLapMs))
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.accent)
                .frame(width: 100, alignment: .trailing)

            Text(RaceFormatters.lapTime(ms: ranking.totalMs))
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textPrimary)
                .frame(width: 110, alignment: .trailing)

            Text("\(ranking.totalLaps)")
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 64, alignment: .trailing)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(BBNColors.background)
        .overlay(
            Rectangle().fill(BBNColors.border.opacity(0.5)).frame(height: 0.5),
            alignment: .bottom
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Posición \(ranking.position), kart \(ranking.kartNumber), \(ranking.driverName), promedio \(RaceFormatters.lapTime(ms: ranking.avgLapMs)), total \(RaceFormatters.lapTime(ms: ranking.totalMs))")
    }
}
