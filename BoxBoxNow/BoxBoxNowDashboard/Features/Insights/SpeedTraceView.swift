import SwiftUI
import Charts

/// Line chart: speed (km/h) vs distance (m or km).
/// Supports an optional overlay (second trace) for compare mode.
struct SpeedTraceView: View {
    let distances: [Double]
    let speeds: [Double]
    /// Optional second trace overlayed on top (e.g. compare mode on
    /// GPS Insights). When both arrays are non-empty, the second trace
    /// is drawn in a contrasting cyan color and a small legend appears.
    var compareDistances: [Double] = []
    var compareSpeeds: [Double] = []
    var primaryLabel: String = "Vuelta A"
    var compareLabel: String = "Vuelta B"

    private var hasData: Bool { !distances.isEmpty && !speeds.isEmpty }
    private var hasCompare: Bool { !compareDistances.isEmpty && !compareSpeeds.isEmpty }

    /// True when the max distance exceeds 1 km — axes display in km instead of m.
    private var useKm: Bool {
        let primary = distances.last ?? 0
        let secondary = compareDistances.last ?? 0
        return max(primary, secondary) > 1000
    }

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Velocidad")
                        .font(BBNTypography.title3)
                        .foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    if hasCompare {
                        HStack(spacing: 10) {
                            legendChip(color: BBNColors.accent, label: primaryLabel)
                            legendChip(color: Color(bbnHex: 0x06b6d4), label: compareLabel)
                        }
                    }
                }

                if hasData {
                    chart
                        .frame(height: 180)
                } else {
                    PlaceholderView(text: "Sin datos de velocidad")
                        .frame(height: 180)
                }
            }
        }
    }

    private func legendChip(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(BBNColors.textDim)
        }
    }

    @ViewBuilder
    private var chart: some View {
        let countA = min(distances.count, speeds.count)
        let countB = min(compareDistances.count, compareSpeeds.count)
        Chart {
            ForEach(0..<countA, id: \.self) { i in
                let dist = useKm ? distances[i] / 1000 : distances[i]
                LineMark(
                    x: .value("Distancia", dist),
                    y: .value("Velocidad", speeds[i]),
                    series: .value("Trace", "A")
                )
                .foregroundStyle(BBNColors.accent)
                .interpolationMethod(.catmullRom)
            }
            if hasCompare {
                ForEach(0..<countB, id: \.self) { i in
                    let dist = useKm ? compareDistances[i] / 1000 : compareDistances[i]
                    LineMark(
                        x: .value("Distancia", dist),
                        y: .value("Velocidad", compareSpeeds[i]),
                        series: .value("Trace", "B")
                    )
                    .foregroundStyle(Color(bbnHex: 0x06b6d4))
                    .interpolationMethod(.catmullRom)
                }
            }
        }
        .chartXAxisLabel(useKm ? "km" : "m")
        .chartYAxisLabel("km/h")
        .chartXAxis {
            AxisMarks { value in
                AxisGridLine().foregroundStyle(BBNColors.border)
                AxisValueLabel()
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
            }
        }
        .chartYAxis {
            AxisMarks { value in
                AxisGridLine().foregroundStyle(BBNColors.border)
                AxisValueLabel()
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
            }
        }
    }
}
