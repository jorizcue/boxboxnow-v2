import SwiftUI

struct DriverCardView: View {
    let card: DriverCard
    let kart: KartState?
    let gps: GPSSample?
    let driverVM: DriverViewModel

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Image(systemName: card.iconName)
                    .font(.caption)
                    .foregroundColor(.accentColor)
                Text(card.displayName)
                    .font(.caption2)
                    .foregroundColor(.gray)
                Spacer()
            }

            cardContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(10)
        .frame(height: 100)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    @ViewBuilder
    private var cardContent: some View {
        switch card {
        case .position:
            Text("P\(kart?.position ?? 0)")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundColor(.white)

        case .lapCount:
            Text("\(kart?.laps ?? 0)")
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundColor(.white)

        case .lastLap:
            if let ms = kart?.lastLapMs ?? driverVM.lapTracker.lastLapMs {
                Text(Formatters.msToLapTime(ms))
                    .font(.system(size: 28, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
            } else {
                Text("--:--.---")
                    .font(.system(size: 28, design: .monospaced))
                    .foregroundColor(.gray)
            }

        case .bestLap:
            if let ms = kart?.bestLapMs ?? driverVM.lapTracker.bestLapMs {
                Text(Formatters.msToLapTime(ms))
                    .font(.system(size: 28, weight: .semibold, design: .monospaced))
                    .foregroundColor(.accentColor)
            } else {
                Text("--:--.---")
                    .font(.system(size: 28, design: .monospaced))
                    .foregroundColor(.gray)
            }

        case .gapToLeader:
            gapView(ms: kart?.gapToLeaderMs)

        case .gapToAhead:
            gapView(ms: kart?.gapToAheadMs)

        case .speed:
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(Formatters.speedString(gps?.speedKmh ?? 0))
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("km/h")
                    .font(.caption)
                    .foregroundColor(.gray)
            }

        case .gForce:
            GForceRadarView(gx: gps?.gForceX ?? 0, gy: gps?.gForceY ?? 0)
                .frame(height: 60)

        case .currentStint:
            Text("\(kart?.stint ?? 1)")
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundColor(.white)

        case .pitStops:
            Text("\(kart?.pitStops ?? 0)")
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundColor(.white)

        case .sector:
            Text("S\(kart?.sector ?? 1)")
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundColor(.white)

        case .delta:
            if let d = driverVM.lapTracker.deltaMs {
                Text(Formatters.deltaString(d))
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .foregroundColor(Formatters.deltaColor(d))
            } else {
                Text("+0.000")
                    .font(.system(size: 28, design: .monospaced))
                    .foregroundColor(.gray)
            }

        case .consistency:
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 30))
                .foregroundColor(.accentColor)

        case .lapHistory:
            Text("Historial")
                .font(.caption)
                .foregroundColor(.gray)

        default:
            Text("--")
                .font(.title2)
                .foregroundColor(.gray)
        }
    }

    private func gapView(ms: Double?) -> some View {
        Group {
            if let ms = ms {
                Text(Formatters.deltaString(ms))
                    .font(.system(size: 28, weight: .semibold, design: .monospaced))
                    .foregroundColor(Formatters.deltaColor(ms))
            } else {
                Text("+0.000")
                    .font(.system(size: 28, design: .monospaced))
                    .foregroundColor(.gray)
            }
        }
    }
}
