import SwiftUI

/// Detail sheet for a single kart: best laps and driver breakdown.
struct KartAnalyticsDetailSheet: View {
    @Environment(AppStore.self) private var app
    @Environment(\.dismiss) private var dismiss

    let kart: KartStats
    let circuitId: Int
    let dateFrom: String
    let dateTo: String

    @State private var bestLaps: [KartBestLap] = []
    @State private var drivers: [KartDriver] = []
    @State private var isLoading: Bool = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    summaryHeader
                    bestLapsSection
                    driversSection
                }
                .padding(20)
            }
            .background(BBNColors.background)
            .navigationTitle("Kart \(kart.kartNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(BBNColors.accent)
                }
            }
            .toolbarBackground(BBNColors.card, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .task { await loadDetails() }
    }

    // MARK: - Summary Header

    private var summaryHeader: some View {
        BBNCard {
            HStack(spacing: 16) {
                KartNumberBadge(number: kart.kartNumber, size: 64)

                VStack(alignment: .leading, spacing: 6) {
                    statRow(label: "Mejor vuelta", value: RaceFormatters.lapTime(ms: Double(kart.bestLapMs)))
                    statRow(label: "Top 5 prom.", value: RaceFormatters.lapTime(ms: kart.best5AvgMs))
                    statRow(label: "Promedio", value: RaceFormatters.lapTime(ms: kart.avgLapMs))
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 6) {
                    Text("\(kart.races) carreras")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                    Text("\(kart.validLaps) vueltas")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                    Text("\(kart.totalLaps) totales")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textDim)
                }
            }
        }
    }

    // MARK: - Best Laps

    @ViewBuilder
    private var bestLapsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mejores vueltas")
                .font(BBNTypography.title3)
                .foregroundStyle(BBNColors.textPrimary)

            if isLoading {
                ProgressView()
                    .tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else if bestLaps.isEmpty {
                Text("Sin datos")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textDim)
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(bestLaps.prefix(5)) { lap in
                        BBNCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(RaceFormatters.lapTime(ms: Double(lap.lapTimeMs)))
                                        .font(BBNTypography.bodyBold)
                                        .foregroundStyle(BBNColors.textPrimary)
                                        .monospacedDigit()
                                    Text("Vuelta \(lap.lapNumber)")
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textDim)
                                }

                                Spacer()

                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(lap.driverName)
                                        .font(BBNTypography.body)
                                        .foregroundStyle(BBNColors.textMuted)
                                    Text(lap.teamName)
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textDim)
                                }

                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(Self.displayDate(from: lap.raceDate))
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textDim)
                                }
                                .frame(width: 80)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Drivers

    @ViewBuilder
    private var driversSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pilotos")
                .font(BBNTypography.title3)
                .foregroundStyle(BBNColors.textPrimary)

            if isLoading {
                ProgressView()
                    .tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else if drivers.isEmpty {
                Text("Sin datos")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textDim)
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(drivers) { driver in
                        BBNCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(driver.displayName)
                                        .font(BBNTypography.bodyBold)
                                        .foregroundStyle(BBNColors.textPrimary)
                                    Text(driver.teamName)
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textDim)
                                }

                                Spacer()

                                VStack(alignment: .trailing, spacing: 2) {
                                    HStack(spacing: 4) {
                                        Text("Promedio")
                                            .font(BBNTypography.caption)
                                            .foregroundStyle(BBNColors.textDim)
                                        Text(RaceFormatters.lapTime(ms: driver.avgLapMs))
                                            .font(BBNTypography.bodyBold)
                                            .foregroundStyle(BBNColors.textPrimary)
                                            .monospacedDigit()
                                    }
                                    HStack(spacing: 4) {
                                        Text("Mejor")
                                            .font(BBNTypography.caption)
                                            .foregroundStyle(BBNColors.textDim)
                                        Text(RaceFormatters.lapTime(ms: Double(driver.bestLapMs)))
                                            .font(BBNTypography.body)
                                            .foregroundStyle(BBNColors.textMuted)
                                            .monospacedDigit()
                                    }
                                }

                                Text("\(driver.totalLaps) vueltas")
                                    .font(BBNTypography.caption)
                                    .foregroundStyle(BBNColors.textDim)
                                    .frame(width: 70, alignment: .trailing)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private func statRow(label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            Text(value)
                .font(BBNTypography.bodyBold)
                .foregroundStyle(BBNColors.textPrimary)
                .monospacedDigit()
        }
    }

    private func loadDetails() async {
        isLoading = true
        async let laps = app.analytics.bestLaps(
            circuitId: circuitId,
            kartNumber: kart.kartNumber,
            dateFrom: dateFrom,
            dateTo: dateTo
        )
        async let drvs = app.analytics.drivers(
            circuitId: circuitId,
            kartNumber: kart.kartNumber,
            dateFrom: dateFrom,
            dateTo: dateTo
        )
        bestLaps = await laps
        drivers = await drvs
        isLoading = false
    }

    /// Converts "2025-04-10" to "10/04/2025" for display.
    private static func displayDate(from iso: String) -> String {
        let parts = iso.prefix(10).split(separator: "-")
        guard parts.count == 3 else { return iso }
        return "\(parts[2])/\(parts[1])/\(parts[0])"
    }
}
