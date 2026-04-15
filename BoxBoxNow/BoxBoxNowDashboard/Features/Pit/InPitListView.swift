import SwiftUI

/// Vertical list of karts whose `pitStatus == "in_pit"`, sorted by
/// classification position. Empty state shown when nobody is pitting.
struct InPitListView: View {
    let karts: [KartStateFull]

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("En boxes")
                    .font(BBNTypography.title3)
                    .foregroundStyle(BBNColors.textPrimary)

                if karts.isEmpty {
                    Text("Nadie en boxes")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(karts) { kart in
                        HStack(spacing: 12) {
                            KartNumberBadge(number: kart.base.kartNumber, size: 44)

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

                            Spacer()

                            VStack(alignment: .trailing, spacing: 2) {
                                Text("Pos \(kart.base.position)")
                                    .font(BBNTypography.caption)
                                    .foregroundStyle(BBNColors.textMuted)
                                Text("Pits \(kart.base.pitCount)")
                                    .font(BBNTypography.bodyBold)
                                    .monospacedDigit()
                                    .foregroundStyle(BBNColors.warning)
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(BBNColors.background)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(rowLabel(for: kart))
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(karts.isEmpty ? "En boxes, vacío" : "En boxes, \(karts.count) karts")
        }
    }

    private func rowLabel(for kart: KartStateFull) -> String {
        var parts: [String] = []
        parts.append("Posición \(kart.base.position)")
        parts.append("kart \(kart.base.kartNumber)")
        if let driver = kart.base.driverName { parts.append(driver) }
        if let team = kart.base.teamName, !team.isEmpty { parts.append("equipo \(team)") }
        parts.append("\(kart.base.pitCount) paradas")
        return parts.joined(separator: ", ")
    }
}
