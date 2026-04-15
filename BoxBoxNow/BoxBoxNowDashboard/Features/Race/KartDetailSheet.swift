import SwiftUI

struct KartDetailSheet: View {
    let kart: KartStateFull
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    summary
                    recentLaps
                    pitHistory
                }
                .padding(20)
            }
            .background(BBNColors.background.ignoresSafeArea())
            .navigationTitle("Kart \(kart.base.kartNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                        .tint(BBNColors.accent)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            KartNumberBadge(number: kart.base.kartNumber, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(kart.base.driverName ?? "—")
                    .font(BBNTypography.title2)
                    .foregroundStyle(BBNColors.textPrimary)
                if let team = kart.base.teamName, !team.isEmpty {
                    Text(team)
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                }
            }
            Spacer()
            Text(RaceFormatters.position(kart.base.position))
                .font(BBNTypography.title1)
                .foregroundStyle(BBNColors.accent)
        }
    }

    private var summary: some View {
        HStack(spacing: 12) {
            BBNStatCard(label: "Mejor", value: RaceFormatters.lapTime(ms: kart.base.bestLapMs))
            BBNStatCard(label: "Última", value: RaceFormatters.lapTime(ms: kart.base.lastLapMs))
            BBNStatCard(label: "Promedio", value: RaceFormatters.lapTime(ms: kart.base.avgLapMs))
            BBNStatCard(label: "Vueltas", value: "\(kart.base.totalLaps)")
        }
    }

    @ViewBuilder
    private var recentLaps: some View {
        if !kart.recentLaps.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Últimas vueltas")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                ForEach(Array(kart.recentLaps.enumerated()), id: \.element.totalLap) { idx, lap in
                    HStack {
                        Text("Vuelta \(lap.totalLap)")
                            .font(BBNTypography.body)
                            .foregroundStyle(BBNColors.textPrimary)
                        Spacer()
                        Text(RaceFormatters.lapTime(ms: lap.lapTime))
                            .font(BBNTypography.body)
                            .monospacedDigit()
                            .foregroundStyle(idx == bestLapIndex ? BBNColors.accent : BBNColors.textPrimary)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 12)
                    .background(BBNColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    @ViewBuilder
    private var pitHistory: some View {
        if !kart.pitHistory.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Historial de pits")
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                ForEach(kart.pitHistory) { p in
                    HStack {
                        Text("Pit \(p.pitNumber)")
                            .font(BBNTypography.body)
                            .foregroundStyle(BBNColors.textPrimary)
                        Spacer()
                        Text(RaceFormatters.lapTime(ms: p.pitTimeMs))
                            .font(BBNTypography.body)
                            .monospacedDigit()
                            .foregroundStyle(BBNColors.textPrimary)
                        Text("Vuelta \(p.lap)")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 12)
                    .background(BBNColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    private var bestLapIndex: Int? {
        kart.recentLaps
            .enumerated()
            .min(by: { $0.element.lapTime < $1.element.lapTime })?
            .offset
    }
}
