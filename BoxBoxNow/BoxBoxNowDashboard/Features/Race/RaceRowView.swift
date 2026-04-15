import SwiftUI

struct RaceRowView: View {
    let kart: KartStateFull
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 0) {
                Text(RaceFormatters.position(kart.base.position))
                    .font(BBNTypography.bodyBold)
                    .foregroundStyle(BBNColors.textPrimary)
                    .monospacedDigit()
                    .frame(width: 48, alignment: .leading)

                HStack(spacing: 6) {
                    KartNumberBadge(number: kart.base.kartNumber)
                    if kart.base.isInPit {
                        Text("BOX")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.warning)
                    }
                }
                .frame(width: 72, alignment: .leading)

                VStack(alignment: .leading, spacing: 2) {
                    Text(kart.base.driverName ?? "—")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textPrimary)
                    if let team = kart.base.teamName, !team.isEmpty {
                        Text(team)
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                cell(RaceFormatters.lapTime(ms: kart.base.lastLapMs), width: 80, align: .trailing)
                cell(RaceFormatters.lapTime(ms: kart.base.bestLapMs), width: 80, align: .trailing,
                     color: BBNColors.accent)
                cell(kart.base.gap ?? "—", width: 80, align: .trailing)
                cell(kart.base.interval ?? "—", width: 80, align: .trailing)
                cell("\(kart.base.totalLaps)", width: 64, align: .trailing)
                cell("\(kart.base.pitCount)", width: 48, align: .trailing)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(BBNColors.background)
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

    @ViewBuilder
    private func cell(_ text: String, width: CGFloat, align: Alignment,
                      color: Color = BBNColors.textPrimary) -> some View {
        Text(text)
            .font(BBNTypography.body)
            .foregroundStyle(color)
            .monospacedDigit()
            .frame(width: width, alignment: align)
    }
}
