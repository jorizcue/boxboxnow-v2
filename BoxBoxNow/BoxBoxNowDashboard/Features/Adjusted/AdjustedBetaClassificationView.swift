import SwiftUI

/// "Clasif. Real Beta" — driver-centric ranking computed client-side from
/// `KartStateFull.driverAvgLapMs` / `driverTotalMs`. One row per (kart, driver)
/// combination, sorted by ascending average lap time.
struct AdjustedBetaClassificationView: View {
    @Environment(AppStore.self) private var app

    private let columns: [ClassificationHeader.Column] = [
        .init(title: "Pos", width: 48, align: .leading),
        .init(title: "Kart", width: 60, align: .leading),
        .init(title: "Piloto / Equipo", width: nil, align: .leading),
        .init(title: "Avg", width: 100, align: .trailing),
        .init(title: "Total", width: 110, align: .trailing),
        .init(title: "Vueltas", width: 64, align: .trailing),
    ]

    var body: some View {
        VStack(spacing: 0) {
            ClassificationHeader(columns: columns)

            if rankings.isEmpty {
                PlaceholderView(text: "Esperando datos de pilotos…")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(rankings) { ranking in
                            DriverRankingRow(ranking: ranking)
                        }
                    }
                }
            }
        }
        .background(BBNColors.background)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Clasificación beta por piloto")
    }

    /// Flatten each kart's driver aggregates into per-driver rows, then sort
    /// by ascending average lap time and assign 1-based positions.
    private var rankings: [DriverRanking] {
        struct Raw {
            let kartNumber: Int
            let teamName: String
            let driverName: String
            let avgLapMs: Double
            let totalMs: Double
            let totalLaps: Int
        }

        let raws: [Raw] = app.race.karts.flatMap { kart -> [Raw] in
            let team = kart.base.teamName ?? ""
            return kart.driverAvgLapMs.compactMap { (driver, avg) -> Raw? in
                guard avg > 0 else { return nil }
                let total = kart.driverTotalMs[driver] ?? 0
                return Raw(
                    kartNumber: kart.base.kartNumber,
                    teamName: team,
                    driverName: driver,
                    avgLapMs: avg,
                    totalMs: total,
                    totalLaps: kart.base.totalLaps
                )
            }
        }

        return raws
            .sorted { $0.avgLapMs < $1.avgLapMs }
            .enumerated()
            .map { idx, raw in
                DriverRanking(
                    id: "\(raw.kartNumber)-\(raw.driverName)",
                    position: idx + 1,
                    kartNumber: raw.kartNumber,
                    teamName: raw.teamName,
                    driverName: raw.driverName,
                    avgLapMs: raw.avgLapMs,
                    totalMs: raw.totalMs,
                    totalLaps: raw.totalLaps
                )
            }
    }
}
