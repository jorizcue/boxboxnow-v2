import SwiftUI

/// Row for the "Clasif. Real" view. Renders a server-provided
/// `ClassificationEntry` directly — the server owns the ranking order,
/// tier adjustment, and gap/interval strings, so this is pure display.
struct ClassificationRow: View {
    let entry: ClassificationEntry

    var body: some View {
        HStack(spacing: 12) {
            Text("\(entry.position)º")
                .font(BBNTypography.bodyBold)
                .foregroundStyle(BBNColors.textPrimary)
                .monospacedDigit()
                .frame(width: 48, alignment: .leading)

            KartNumberBadge(number: entry.kartNumber, size: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.driverName)
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                if !entry.teamName.isEmpty {
                    Text(entry.teamName)
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(RaceFormatters.lapTime(ms: entry.avgLapMs))
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.accent)
                .frame(width: 100, alignment: .trailing)

            Text(entry.gap.isEmpty ? "—" : entry.gap)
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textPrimary)
                .frame(width: 80, alignment: .trailing)

            Text("\(entry.totalLaps)")
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 64, alignment: .trailing)

            Text("\(entry.pitCount)")
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 48, alignment: .trailing)
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

    private var a11yLabel: String {
        var parts: [String] = []
        parts.append("Posición \(entry.position)")
        parts.append("kart \(entry.kartNumber)")
        parts.append(entry.driverName)
        if !entry.teamName.isEmpty { parts.append("equipo \(entry.teamName)") }
        parts.append("promedio \(RaceFormatters.lapTime(ms: entry.avgLapMs))")
        if !entry.gap.isEmpty { parts.append("gap \(entry.gap)") }
        parts.append("\(entry.totalLaps) vueltas")
        parts.append("\(entry.pitCount) paradas")
        return parts.joined(separator: ", ")
    }
}
