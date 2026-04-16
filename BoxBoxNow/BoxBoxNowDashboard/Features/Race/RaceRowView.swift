import SwiftUI

struct RaceRowView: View {
    let kart: KartStateFull
    let config: RaceConfig?
    /// Live-ticking stint seconds derived from the race clock. The parent
    /// (`RaceView`) reads the `RaceStore`'s `interpolatedCountdownMs` once
    /// per frame and passes the per-kart value here so every row stays in
    /// sync. Falls back to `base.stintDurationS` when the parent didn't
    /// provide one (e.g. previews).
    var liveStintSec: Double? = nil
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

                // Pit count — show "X/Y" while pits are pending (matches web)
                pitCell
                    .frame(width: 56, alignment: .trailing)

                // Tier score badge — wider so "100" never truncates
                BBNTierBadge(score: kart.base.tierScore)
                    .frame(width: 56, alignment: .center)

                // Stint time + laps
                stintCell
                    .frame(width: 110, alignment: .trailing)

                // Pit status dot
                pitStatusDot
                    .frame(width: 28, alignment: .center)
            }
            .padding(.vertical, 7)
            .padding(.horizontal, 8)
            .background(rowBackground)
            .overlay(alignment: .leading) {
                // Left accent stripe for "our kart"
                if isOurKart {
                    Rectangle()
                        .fill(BBNColors.accent)
                        .frame(width: 3)
                }
            }
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

    // MARK: - Our-kart highlight

    private var isOurKart: Bool {
        guard let num = config?.ourKartNumber, num > 0 else { return false }
        return kart.base.kartNumber == num
    }

    private var rowBackground: Color {
        if isOurKart { return BBNColors.accent.opacity(0.10) }
        if kart.base.isInPit { return BBNColors.danger.opacity(0.06) }
        return BBNColors.background
    }

    // MARK: - Pit cell (X/Y format matching web)

    @ViewBuilder
    private var pitCell: some View {
        let minPits = config?.minPits ?? 0
        let pending = max(0, minPits - kart.base.pitCount)
        HStack(spacing: 2) {
            Text("\(kart.base.pitCount)")
                .font(BBNTypography.body)
                .foregroundStyle(pending > 0 ? BBNColors.tier25 : BBNColors.textPrimary)
                .monospacedDigit()
            if pending > 0 {
                Text("/\(minPits)")
                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                    .foregroundStyle(BBNColors.textDim)
            }
        }
    }

    // MARK: - Stint

    private var stintCell: some View {
        let durationS = liveStintSec ?? kart.base.stintDurationS
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
