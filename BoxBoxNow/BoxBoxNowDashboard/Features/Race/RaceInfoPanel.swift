import SwiftUI

/// Top panel with 9 live indicator cards + BOX call button + rain toggle.
/// Mirrors `RaceTable.tsx` header on the web:
///   1. Piloto / Última vuelta (with delta arrow)
///   2. Media 20v
///   3. Posición por media (n/total)
///   4. Stint en curso (HH:MM:SS, colored)
///   5. Tiempo hasta stint máximo (HH:MM:SS, colored)
///   6. Vueltas hasta stint máximo (1 decimal)
///   7. Karts cerca de pit
///   8. Botón BOX (call)
///   9. Modo lluvia toggle
///
/// All metrics use `race.interpolatedCountdownMs` so they tick every second
/// between server snapshots — matches the web `useRaceClock` hook.
struct RaceInfoPanel: View {
    @Environment(AppStore.self) private var app

    // Lap-delta tracking for the driver card arrow
    @State private var prevLastLapMs: Double = 0
    @State private var lapDelta: LapDelta? = nil

    private enum LapDelta { case faster, slower }

    private var race: RaceStore { app.race }
    private var config: RaceConfig? { race.config }

    private var ourKart: KartStateFull? {
        guard let num = config?.ourKartNumber, num > 0 else { return nil }
        return race.karts.first { $0.base.kartNumber == num }
    }

    /// Karts sorted by avgLapMs asc (same as the main table) for the
    /// "position by avg" card.
    private var sortedByAvg: [KartStateFull] {
        race.karts.sorted { a, b in
            let av = (a.base.avgLapMs ?? 0) > 0 ? a.base.avgLapMs! : .infinity
            let bv = (b.base.avgLapMs ?? 0) > 0 ? b.base.avgLapMs! : .infinity
            return av < bv
        }
    }

    /// Stint seconds derived from the race clock, matching the web
    /// `stintSecondsFor`. Preferred source: the kart's stintStartCountdownMs
    /// (what the countdown was when the stint started). Falls back to
    /// durationMs if the kart has never pitted.
    private func stintSeconds(for kart: KartStateFull) -> Double {
        let clock = race.interpolatedCountdownMs
        if clock <= 0 || race.raceFinished { return 0 }
        let start = kart.base.stintStartCountdownMs ?? (race.durationMs > 0 ? race.durationMs : clock)
        return max(0, (start - clock) / 1000)
    }

    private var ourStintSec: Double { ourKart.map(stintSeconds) ?? 0 }
    private var ourStintMin: Double { ourStintSec / 60 }

    private var maxStintMin: Double { Double(config?.maxStintMin ?? 40) }
    private var minStintMin: Double { Double(config?.minStintMin ?? 5) }

    private var timeToMaxStintSec: Double {
        max(0, maxStintMin * 60 - ourStintSec)
    }

    private var lapsToMaxStint: Double {
        guard let kart = ourKart, let avg = kart.base.avgLapMs, avg > 0 else { return 0 }
        return timeToMaxStintSec / (avg / 1000)
    }

    private var kartsNearPitCount: Int {
        race.karts.filter { kart in
            let min = stintSeconds(for: kart) / 60
            return min >= maxStintMin - 5 && !kart.base.isInPit
        }.count
    }

    private var ourAvgPosition: Int {
        guard let num = config?.ourKartNumber, num > 0 else { return 0 }
        guard let idx = sortedByAvg.firstIndex(where: { $0.base.kartNumber == num }) else { return 0 }
        return idx + 1
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                driverLastLapCard
                avgLapCard
                avgPositionCard
                stintCurrentCard
                timeToMaxStintCard
                lapsToMaxStintCard
                kartsNearPitCard
                boxButton
                rainToggle
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(BBNColors.surface)

            Divider().overlay(BBNColors.border)
        }
        // Track lap delta whenever our kart finishes a lap
        .onChange(of: ourKart?.base.lastLapMs ?? 0) { _, newValue in
            guard newValue > 0 else { return }
            if prevLastLapMs > 0, newValue != prevLastLapMs {
                lapDelta = newValue < prevLastLapMs ? .faster : .slower
            }
            prevLastLapMs = newValue
        }
    }

    // MARK: - Cards

    private var driverLastLapCard: some View {
        MetricCard(
            label: "PILOTO / ULT. VUELTA",
            accessoryBelowLabel: Text(ourKart?.base.driverName ?? ourKart?.base.teamName ?? "—")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(BBNColors.textPrimary)
                .lineLimit(1)
                .eraseToAnyView(),
            valueView: AnyView(
                HStack(spacing: 2) {
                    if let delta = lapDelta {
                        Image(systemName: delta == .faster ? "arrow.down" : "arrow.up")
                            .font(.system(size: 13, weight: .bold))
                    }
                    Text(RaceFormatters.lapTime(ms: ourKart?.base.lastLapMs))
                }
                .foregroundStyle(
                    lapDelta == .faster ? BBNColors.success :
                    lapDelta == .slower ? BBNColors.warning : BBNColors.textPrimary
                )
                .font(.system(size: 18, weight: .black, design: .monospaced))
            )
        )
    }

    private var avgLapCard: some View {
        MetricCard(
            label: "MEDIA 20V",
            valueView: AnyView(
                Text(RaceFormatters.lapTime(ms: ourKart?.base.avgLapMs))
                    .font(.system(size: 18, weight: .black, design: .monospaced))
                    .foregroundStyle(BBNColors.textPrimary)
            )
        )
    }

    private var avgPositionCard: some View {
        let total = sortedByAvg.count
        let color: Color = ourAvgPosition > 0 && ourAvgPosition <= 3 ? BBNColors.accent
            : (ourAvgPosition > 0 && ourAvgPosition <= 10 ? BBNColors.success : BBNColors.textPrimary)
        return MetricCard(
            label: "POSICION POR MEDIA",
            valueView: AnyView(
                Text(ourAvgPosition > 0 ? "\(ourAvgPosition)/\(total)" : "—")
                    .font(.system(size: 18, weight: .black, design: .monospaced))
                    .foregroundStyle(color)
            )
        )
    }

    private var stintCurrentCard: some View {
        let color: Color = {
            if ourStintMin < minStintMin { return BBNColors.danger }
            if ourStintMin >= maxStintMin { return BBNColors.danger }
            if ourStintMin >= maxStintMin - 5 { return BBNColors.warning }
            return BBNColors.success
        }()
        return MetricCard(
            label: "STINT EN CURSO",
            valueView: AnyView(
                Text(RaceFormatters.hhmmss(seconds: ourStintSec))
                    .font(.system(size: 18, weight: .black, design: .monospaced))
                    .foregroundStyle(color)
            )
        )
    }

    private var timeToMaxStintCard: some View {
        let color: Color = {
            if timeToMaxStintSec <= 0 { return BBNColors.danger }
            if timeToMaxStintSec / 60 <= 5 { return BBNColors.warning }
            return BBNColors.textPrimary
        }()
        return MetricCard(
            label: "TIEMPO HASTA STINT MAXIMO",
            valueView: AnyView(
                Text(RaceFormatters.hhmmss(seconds: timeToMaxStintSec))
                    .font(.system(size: 18, weight: .black, design: .monospaced))
                    .foregroundStyle(color)
            )
        )
    }

    private var lapsToMaxStintCard: some View {
        let color: Color = {
            if lapsToMaxStint <= 2 { return BBNColors.danger }
            if lapsToMaxStint <= 5 { return BBNColors.warning }
            return BBNColors.textPrimary
        }()
        return MetricCard(
            label: "VUELTAS HASTA STINT MAXIMO",
            valueView: AnyView(
                Text(lapsToMaxStint > 0 ? String(format: "%.1f", lapsToMaxStint) : "0")
                    .font(.system(size: 18, weight: .black, design: .monospaced))
                    .foregroundStyle(color)
            )
        )
    }

    private var kartsNearPitCard: some View {
        let count = kartsNearPitCount
        let color: Color = count > 3 ? BBNColors.warning : (count > 0 ? BBNColors.tier25 : BBNColors.textPrimary)
        return MetricCard(
            label: "KARTS CERCA DE PIT",
            valueView: AnyView(
                Text("\(count)")
                    .font(.system(size: 18, weight: .black, design: .monospaced))
                    .foregroundStyle(color)
            )
        )
    }

    private var boxButton: some View {
        Button {
            Task { await app.race.sendBoxCall() }
        } label: {
            VStack(spacing: 2) {
                Text("LLAMAR A BOX")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(BBNColors.danger.opacity(0.85))
                    .tracking(1)
                Text(race.boxCallActive ? "ENVIADO" : "BOX")
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(BBNColors.danger)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(BBNColors.danger.opacity(race.boxCallActive ? 0.22 : 0.10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(BBNColors.danger.opacity(race.boxCallActive ? 0.7 : 0.4), lineWidth: 2)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }

    private var rainToggle: some View {
        let raining = config?.rain ?? false
        return VStack(spacing: 2) {
            Text("MODO LLUVIA")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(BBNColors.textDim)
                .tracking(1)
            Text(raining ? "ON" : "OFF")
                .font(.system(size: 20, weight: .black, design: .monospaced))
                .foregroundStyle(raining ? BBNColors.success : BBNColors.textDim)
        }
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(BBNColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Reusable metric card

private struct MetricCard: View {
    let label: String
    var accessoryBelowLabel: AnyView? = nil
    let valueView: AnyView

    var body: some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(BBNColors.textMuted)
                .tracking(1)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            if let accessory = accessoryBelowLabel {
                accessory
            }
            valueView
        }
        .frame(maxWidth: .infinity, minHeight: 64)
        .padding(.vertical, 6)
        .padding(.horizontal, 6)
        .background(BBNColors.card)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(BBNColors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private extension View {
    func eraseToAnyView() -> AnyView { AnyView(self) }
}
