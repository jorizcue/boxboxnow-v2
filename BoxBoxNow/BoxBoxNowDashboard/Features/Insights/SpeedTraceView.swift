import SwiftUI
import Charts

/// Line chart: speed (km/h) vs distance (m or km).
struct SpeedTraceView: View {
    let distances: [Double]
    let speeds: [Double]

    private var hasData: Bool { !distances.isEmpty && !speeds.isEmpty }

    /// True when the max distance exceeds 1 km — axes display in km instead of m.
    private var useKm: Bool { (distances.last ?? 0) > 1000 }

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Velocidad")
                    .font(BBNTypography.title3)
                    .foregroundStyle(BBNColors.textPrimary)

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

    @ViewBuilder
    private var chart: some View {
        let count = min(distances.count, speeds.count)
        Chart {
            ForEach(0..<count, id: \.self) { i in
                let dist = useKm ? distances[i] / 1000 : distances[i]
                LineMark(
                    x: .value("Distancia", dist),
                    y: .value("Velocidad", speeds[i])
                )
                .foregroundStyle(BBNColors.accent)
                .interpolationMethod(.catmullRom)
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
