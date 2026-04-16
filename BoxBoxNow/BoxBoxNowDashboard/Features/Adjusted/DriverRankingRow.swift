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
                Text(ranking.driverName.isEmpty ? "—" : ranking.driverName)
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                if !ranking.teamName.isEmpty {
                    Text(ranking.teamName)
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            cell(RaceFormatters.lapTime(ms: ranking.avgLapMs),
                 width: 100, align: .trailing, color: BBNColors.accent)
            cell(RaceFormatters.lapTime(ms: ranking.totalMs),
                 width: 110, align: .trailing)
            cell("\(ranking.totalLaps)", width: 64, align: .trailing,
                 color: BBNColors.textMuted)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(BBNColors.background)
        .overlay(
            Rectangle().fill(BBNColors.border.opacity(0.5)).frame(height: 0.5),
            alignment: .bottom
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(a11yLabel)
    }

    @ViewBuilder
    private func cell(_ text: String, width: CGFloat, align: Alignment,
                      color: Color = BBNColors.textPrimary) -> some View {
        Text(text)
            .font(BBNTypography.body)
            .foregroundStyle(color)
            .monospacedDigit()
            .frame(width: width, alignment: align)
    }

    private var a11yLabel: String {
        var parts: [String] = []
        parts.append("Posición \(ranking.position)")
        parts.append("kart \(ranking.kartNumber)")
        if !ranking.driverName.isEmpty { parts.append(ranking.driverName) }
        if !ranking.teamName.isEmpty { parts.append("equipo \(ranking.teamName)") }
        parts.append("promedio \(RaceFormatters.lapTime(ms: ranking.avgLapMs))")
        parts.append("total \(RaceFormatters.lapTime(ms: ranking.totalMs))")
        parts.append("\(ranking.totalLaps) vueltas")
        return parts.joined(separator: ", ")
    }
}
