import SwiftUI

/// Circular scatter plot of lateral vs longitudinal G-forces.
/// Concentric rings at 0.5 G intervals, crosshairs, and magnitude-colored dots.
struct GForceScatterView: View {
    let gforceLat: [Double]
    let gforceLon: [Double]

    private var hasData: Bool { !gforceLat.isEmpty && !gforceLon.isEmpty }

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Fuerzas G")
                    .font(BBNTypography.title3)
                    .foregroundStyle(BBNColors.textPrimary)

                if hasData {
                    Canvas { context, size in
                        drawScatter(context: context, size: size)
                    }
                    .aspectRatio(1, contentMode: .fit)
                } else {
                    PlaceholderView(text: "Sin datos de fuerzas G")
                        .frame(height: 200)
                }
            }
        }
    }

    // MARK: - Drawing

    private func drawScatter(context: GraphicsContext, size: CGSize) {
        let side = min(size.width, size.height)
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let maxG: Double = 2.0
        let radius = side / 2 - 24  // leave room for labels

        // Concentric rings at 0.5 G intervals
        let ringStyle = StrokeStyle(lineWidth: 0.5, dash: [4, 4])
        for g in stride(from: 0.5, through: maxG, by: 0.5) {
            let r = radius * g / maxG
            let rect = CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)
            context.stroke(Path(ellipseIn: rect), with: .color(BBNColors.border), style: ringStyle)

            // Ring label
            let label = Text(String(format: "%.1fG", g))
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textDim)
            context.draw(context.resolve(label),
                         at: CGPoint(x: center.x + r + 2, y: center.y - 6))
        }

        // Crosshairs
        let crossColor = BBNColors.textDim.opacity(0.4)
        var hLine = Path()
        hLine.move(to: CGPoint(x: center.x - radius, y: center.y))
        hLine.addLine(to: CGPoint(x: center.x + radius, y: center.y))
        context.stroke(hLine, with: .color(crossColor), lineWidth: 0.5)

        var vLine = Path()
        vLine.move(to: CGPoint(x: center.x, y: center.y - radius))
        vLine.addLine(to: CGPoint(x: center.x, y: center.y + radius))
        context.stroke(vLine, with: .color(crossColor), lineWidth: 0.5)

        // Axis labels: lateral = horizontal (IZQ / DER), longitudinal = vertical (ACEL / FREN)
        let labelFont = BBNTypography.caption
        let labelColor = BBNColors.textDim

        let topLabel = context.resolve(Text("ACEL").font(labelFont).foregroundStyle(labelColor))
        context.draw(topLabel, at: CGPoint(x: center.x, y: center.y - radius - 12))

        let bottomLabel = context.resolve(Text("FREN").font(labelFont).foregroundStyle(labelColor))
        context.draw(bottomLabel, at: CGPoint(x: center.x, y: center.y + radius + 12))

        let leftLabel = context.resolve(Text("IZQ").font(labelFont).foregroundStyle(labelColor))
        context.draw(leftLabel, at: CGPoint(x: center.x - radius - 16, y: center.y))

        let rightLabel = context.resolve(Text("DER").font(labelFont).foregroundStyle(labelColor))
        context.draw(rightLabel, at: CGPoint(x: center.x + radius + 16, y: center.y))

        // Scatter points
        let count = min(gforceLat.count, gforceLon.count)
        let dotRadius: CGFloat = 3
        for i in 0..<count {
            let lat = gforceLat[i]   // lateral -> X axis
            let lon = gforceLon[i]   // longitudinal -> Y axis (positive = accel = up)

            // Clamp to maxG for display
            let clampedLat = min(max(lat, -maxG), maxG)
            let clampedLon = min(max(lon, -maxG), maxG)

            let x = center.x + radius * clampedLat / maxG
            let y = center.y - radius * clampedLon / maxG  // invert Y: positive G = up

            let magnitude = sqrt(lat * lat + lon * lon)
            let color = magnitudeColor(magnitude)

            let dotRect = CGRect(x: x - dotRadius, y: y - dotRadius,
                                 width: dotRadius * 2, height: dotRadius * 2)
            context.fill(Path(ellipseIn: dotRect), with: .color(color))
        }
    }

    /// Green (< 0.7G), yellow (0.7-1.2G), red (> 1.2G).
    private func magnitudeColor(_ g: Double) -> Color {
        if g < 0.7 {
            return .green
        } else if g < 1.2 {
            return .yellow
        } else {
            return .red
        }
    }
}
