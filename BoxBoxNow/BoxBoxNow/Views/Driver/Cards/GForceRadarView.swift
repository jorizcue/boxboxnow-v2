import SwiftUI

struct GForceRadarView: View {
    let gx: Double
    let gy: Double
    private let maxG: Double = 2.0

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 4

            // Background rings
            for ring in [0.5, 1.0, 1.5] {
                let r = radius * CGFloat(ring / maxG)
                let rect = CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)
                context.stroke(Path(ellipseIn: rect), with: .color(.gray.opacity(0.3)), lineWidth: 0.5)
            }

            // Crosshair
            context.stroke(Path { p in
                p.move(to: CGPoint(x: center.x - radius, y: center.y))
                p.addLine(to: CGPoint(x: center.x + radius, y: center.y))
            }, with: .color(.gray.opacity(0.3)), lineWidth: 0.5)

            context.stroke(Path { p in
                p.move(to: CGPoint(x: center.x, y: center.y - radius))
                p.addLine(to: CGPoint(x: center.x, y: center.y + radius))
            }, with: .color(.gray.opacity(0.3)), lineWidth: 0.5)

            // Current G dot
            let dotX = center.x + CGFloat(gx / maxG) * radius
            let dotY = center.y - CGFloat(gy / maxG) * radius
            let dotSize: CGFloat = 8
            let dotRect = CGRect(x: dotX - dotSize/2, y: dotY - dotSize/2, width: dotSize, height: dotSize)
            context.fill(Path(ellipseIn: dotRect), with: .color(.green))
        }
    }
}
