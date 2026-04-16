import SwiftUI

/// Top panel showing race countdown, our kart info, stint status, and BOX call button.
struct RaceInfoPanel: View {
    @Environment(AppStore.self) private var app

    private var race: RaceStore { app.race }
    private var config: RaceConfig? { race.config }
    private var ourKart: KartStateFull? {
        guard let num = config?.ourKartNumber, num > 0 else { return nil }
        return race.karts.first { $0.base.kartNumber == num }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                countdownCard
                if let kart = ourKart {
                    driverCard(kart)
                    avgCard(kart)
                    stintCard(kart)
                    timeToMaxCard(kart)
                }
                kartsNearPitCard
                boxButton
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(BBNColors.surface)

            Divider().overlay(BBNColors.border)
        }
    }

    // MARK: - Countdown

    private var countdownCard: some View {
        VStack(spacing: 2) {
            Text("Cuenta atrás")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            Text(RaceFormatters.countdown(ms: race.countdownMs))
                .font(.system(size: 22, weight: .bold, design: .monospaced))
                .foregroundStyle(race.countdownMs <= 300_000 ? BBNColors.danger : BBNColors.accent)
        }
        .frame(minWidth: 100)
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(BBNColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Driver

    private func driverCard(_ kart: KartStateFull) -> some View {
        VStack(spacing: 2) {
            Text(kart.base.driverName ?? "—")
                .font(BBNTypography.bodyBold)
                .foregroundStyle(BBNColors.textPrimary)
                .lineLimit(1)
            HStack(spacing: 6) {
                Text("Última")
                    .font(.system(size: 9))
                    .foregroundStyle(BBNColors.textDim)
                Text(RaceFormatters.lapTime(ms: kart.base.lastLapMs))
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(BBNColors.textPrimary)
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(BBNColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Avg

    private func avgCard(_ kart: KartStateFull) -> some View {
        VStack(spacing: 2) {
            Text("Media")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            Text(RaceFormatters.lapTime(ms: kart.base.avgLapMs))
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(BBNColors.textPrimary)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(BBNColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Stint

    private func stintCard(_ kart: KartStateFull) -> some View {
        let durationS = kart.base.stintDurationS ?? 0
        let stintColor = RaceFormatters.stintColor(durationS: durationS, config: config)
        return VStack(spacing: 2) {
            Text("Stint actual")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            Text(RaceFormatters.stintWithLaps(
                durationS: durationS,
                laps: kart.base.stintLapsCount
            ))
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(stintColor)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(BBNColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Time to max stint

    private func timeToMaxCard(_ kart: KartStateFull) -> some View {
        let durationS = kart.base.stintDurationS ?? 0
        let maxS = Double(config?.maxStintMin ?? 40) * 60
        let remaining = max(0, maxS - durationS)
        let color: Color = remaining <= 300 ? BBNColors.danger :
                           remaining <= 600 ? BBNColors.warning : BBNColors.textPrimary
        return VStack(spacing: 2) {
            Text("Hasta max stint")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            Text(RaceFormatters.stint(elapsedMs: remaining * 1000))
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(color)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(BBNColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Karts near pit

    private var kartsNearPitCard: some View {
        let maxStintMin = Double(config?.maxStintMin ?? 40)
        let count = race.karts.filter { kart in
            let durationMin = (kart.base.stintDurationS ?? 0) / 60
            return (maxStintMin - durationMin) <= 5 && durationMin < maxStintMin
        }.count
        return VStack(spacing: 2) {
            Text("Cerca de box")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            Text("\(count)")
                .font(BBNTypography.title3)
                .foregroundStyle(count > 0 ? BBNColors.warning : BBNColors.textPrimary)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(BBNColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - BOX button

    private var boxButton: some View {
        Button {
            Task { await app.race.sendBoxCall() }
        } label: {
            Text("BOX")
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 70, height: 48)
                .background(
                    race.boxCallActive
                        ? AnyShapeStyle(BBNColors.warning)
                        : AnyShapeStyle(BBNColors.danger)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(race.boxCallActive ? BBNColors.warning : BBNColors.danger, lineWidth: 2)
                )
        }
        .buttonStyle(.plain)
    }
}
