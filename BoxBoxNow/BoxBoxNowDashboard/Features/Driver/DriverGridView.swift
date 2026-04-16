import SwiftUI

/// Responsive card grid for the driver live view. Switches between 2
/// columns (portrait) and 3 columns (landscape) based on the available
/// width. Cards are vertically sized to fill the screen without scrolling,
/// which is the driver app's core design constraint — the driver must see
/// all their cards at a glance without touching the screen.
struct DriverGridView: View {
    let cardIds: [String]
    let kart: KartStateFull?
    let countdownMs: Double

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let numCols = isLandscape ? 3 : 2
            let spacing: CGFloat = 8
            let rows = chunked(cardIds, into: numCols)
            let numRows = max(1, rows.count)
            let totalVSpacing = spacing * CGFloat(numRows + 1)
            let cardHeight = max(90, (geo.size.height - totalVSpacing) / CGFloat(numRows))

            VStack(spacing: spacing) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: spacing) {
                        ForEach(row, id: \.self) { cardId in
                            DriverCardView(
                                cardId: cardId,
                                kart: kart,
                                countdownMs: countdownMs,
                                height: cardHeight
                            )
                        }
                        // Fill remaining space in incomplete rows
                        if row.count < numCols {
                            ForEach(0..<(numCols - row.count), id: \.self) { _ in
                                Color.clear.frame(height: cardHeight)
                            }
                        }
                    }
                }
            }
            .padding(spacing)
        }
        .background(Color.black)
    }

    private func chunked(_ array: [String], into size: Int) -> [[String]] {
        stride(from: 0, to: array.count, by: size).map {
            Array(array[$0..<Swift.min($0 + size, array.count)])
        }
    }
}
