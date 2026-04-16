import SwiftUI

struct RaceRowView: View {
    let kart: KartStateFull
    let config: RaceConfig?
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 0) {
                // Position
                Text(RaceFormatters.position(kart.base.position))
                    .font(BBNTypography.bodyBold)
                    .foregroundStyle(BBNColors.textPrimary)
                    .monospacedDigit()
                    .frame(width: 36, alignment: .center)

                // Kart number + pit badge
                HStack(spacing: 4) {
                    KartNumberBadge(number: kart.base.kartNumber)
                    if kart.base.isInPit {
                        Text("PIT")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 3)
                            .padding(.vertical, 1)
                            .background(BBNColors.danger)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                    }
                }
                .frame(width: 56, alignment: .leading)

                // Driver + Team
                VStack(alignment: .leading, spacing: 1) {
                    Text(kart.base.driverName ?? "—")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textPrimary)
                        .lineLimit(1)
                    if let team = kart.base.teamName, !team.isEmpty {
                        Text(team)
                            .font(.system(size: 10))
                            .foregroundStyle(BBNColors.textDim)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Avg 20 laps
                timeCell(RaceFormatters.lapTime(ms: kart.base.avgLapMs), width: 76)

                // Best 3 laps
                timeCell(RaceFormatters.lapTime(ms: kart.base.bestAvgMs), width: 76)

                // Last lap
                timeCell(RaceFormatters.lapTime(ms: kart.base.lastLapMs), width: 76)

                // Best stint lap
                timeCell(RaceFormatters.lapTime(ms: kart.base.bestStintLapMs), width: 76,
                         color: BBNColors.accent)

                // Total laps
                Text("\(kart.base.totalLaps)")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                    .monospacedDigit()
                    .frame(width: 52, alignment: .trailing)

                // Pit count
                Text("\(kart.base.pitCount)")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
                    .monospacedDigit()
                    .frame(width: 36, alignment: .trailing)

                // Tier score badge
                BBNTierBadge(score: kart.base.tierScore)
                    .frame(width: 44, alignment: .center)

                // Stint time + laps
                stintCell
                    .frame(width: 90, alignment: .trailing)

                // Pit status dot
                pitStatusDot
                    .frame(width: 28, alignment: .center)
            }
            .padding(.vertical, 7)
            .padding(.horizontal, 8)
            .background(kart.base.isInPit ? BBNColors.danger.opacity(0.06) : BBNColors.background)
            .overlay(
                Rectangle().fill(BBNColors.border.opacity(0.5)).frame(height: 0.5),
                alignment: .bottom
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabelText)
        .accessibilityHint("Muestra el detalle del kart")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Stint

    private var stintCell: some View {
        let durationS = kart.base.stintDurationS
        let stintColor = RaceFormatters.stintColor(durationS: durationS, config: config)
        let text = RaceFormatters.stintWithLaps(
            durationS: durationS,
            laps: kart.base.stintLapsCount
        )
        return Text(text)
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(stintColor)
    }

    // MARK: - Pit Status Dot

    private var pitStatusDot: some View {
        Circle()
            .fill(kart.base.isInPit ? BBNColors.danger : BBNColors.success)
            .frame(width: 8, height: 8)
    }

    // MARK: - Helpers

    @ViewBuilder
    private func timeCell(_ text: String, width: CGFloat,
                          color: Color = BBNColors.textPrimary) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .regular, design: .monospaced))
            .foregroundStyle(color)
            .frame(width: width, alignment: .trailing)
    }

    private var accessibilityLabelText: String {
        var parts: [String] = []
        parts.append("Posición \(kart.base.position)")
        parts.append("Kart \(kart.base.kartNumber)")
        if let driver = kart.base.driverName { parts.append(driver) }
        if let team = kart.base.teamName { parts.append(team) }
        parts.append("\(kart.base.totalLaps) vueltas")
        if let last = kart.base.lastLapMs {
            parts.append("última \(RaceFormatters.lapTime(ms: last))")
        }
        return parts.joined(separator: ", ")
    }
}
