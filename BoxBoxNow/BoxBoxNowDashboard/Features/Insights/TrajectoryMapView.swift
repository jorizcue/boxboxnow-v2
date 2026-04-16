import SwiftUI

/// Canvas-drawn GPS trajectory colored by speed.
/// Blue (slow) -> yellow (mid) -> red (fast) using HSB interpolation.
struct TrajectoryMapView: View {
    let positions: [GPSPosition]
    let speeds: [Double]?

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Trayectoria")
                    .font(BBNTypography.title3)
                    .foregroundStyle(BBNColors.textPrimary)

                if positions.count < 2 {
                    PlaceholderView(text: "Sin datos de posicion")
                        .frame(minHeight: 260)
                } else {
                    Canvas { context, size in
                        drawTrajectory(context: context, size: size)
                    }
                    .frame(minHeight: 260)
                }
            }
        }
        .frame(minHeight: 300)
    }

    // MARK: - Drawing

    private func drawTrajectory(context: GraphicsContext, size: CGSize) {
        let padding: CGFloat = 20

        // Compute lat/lon bounds
        let lats = positions.map(\.lat)
        let lons = positions.map(\.lon)
        guard let minLat = lats.min(), let maxLat = lats.max(),
              let minLon = lons.min(), let maxLon = lons.max() else { return }

        let latRange = maxLat - minLat
        let lonRange = maxLon - minLon

        let drawW = size.width - padding * 2
        let drawH = size.height - padding * 2
        guard drawW > 0, drawH > 0 else { return }

        // Aspect-ratio-preserving scale. Use lon range for X and lat range
        // for Y (north up, so Y is inverted).
        let safeLatRange = max(latRange, 1e-6)
        let safeLonRange = max(lonRange, 1e-6)
        let scaleX = drawW / safeLonRange
        let scaleY = drawH / safeLatRange
        let scale = min(scaleX, scaleY)

        // Center offset
        let usedW = safeLonRange * scale
        let usedH = safeLatRange * scale
        let offsetX = padding + (drawW - usedW) / 2
        let offsetY = padding + (drawH - usedH) / 2

        func point(for pos: GPSPosition) -> CGPoint {
            let x = (pos.lon - minLon) * scale + offsetX
            // Invert Y so north is up
            let y = (maxLat - pos.lat) * scale + offsetY
            return CGPoint(x: x, y: y)
        }

        // Speed range for color mapping
        let speedValues = speeds ?? []
        let minSpeed = speedValues.min() ?? 0
        let maxSpeed = speedValues.max() ?? 1
        let speedRange = max(maxSpeed - minSpeed, 1e-3)

        // Draw line segments colored by speed
        for i in 1..<positions.count {
            let from = point(for: positions[i - 1])
            let to = point(for: positions[i])
            var path = Path()
            path.move(to: from)
            path.addLine(to: to)

            let color: Color
            if !speedValues.isEmpty, i < speedValues.count {
                let fraction = (speedValues[i] - minSpeed) / speedRange
                color = speedColor(fraction: fraction)
            } else {
                color = BBNColors.accent
            }
            context.stroke(path, with: .color(color), lineWidth: 2.5)
        }

        // Start dot (green) and end dot (red)
        let startPt = point(for: positions[0])
        let endPt = point(for: positions[positions.count - 1])
        let dotRadius: CGFloat = 5

        let startRect = CGRect(x: startPt.x - dotRadius, y: startPt.y - dotRadius,
                               width: dotRadius * 2, height: dotRadius * 2)
        context.fill(Path(ellipseIn: startRect), with: .color(.green))

        let endRect = CGRect(x: endPt.x - dotRadius, y: endPt.y - dotRadius,
                             width: dotRadius * 2, height: dotRadius * 2)
        context.fill(Path(ellipseIn: endRect), with: .color(.red))
    }

    /// Maps a 0-1 speed fraction to a blue -> yellow -> red color via HSB.
    /// Hue: 240 (blue) -> 60 (yellow) -> 0 (red).
    private func speedColor(fraction: Double) -> Color {
        let clamped = min(max(fraction, 0), 1)
        let hue: Double
        if clamped < 0.5 {
            // Blue (240) -> Yellow (60): interpolate 240 -> 60
            hue = 240 - clamped * 2 * 180  // 240 -> 60
        } else {
            // Yellow (60) -> Red (0): interpolate 60 -> 0
            hue = 60 - (clamped - 0.5) * 2 * 60  // 60 -> 0
        }
        return Color(hue: hue / 360, saturation: 0.9, brightness: 0.95)
    }
}
