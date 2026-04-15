import SwiftUI

struct BBNTierBadge: View {
    let score: Double?

    var body: some View {
        Text(score.map { String(Int($0)) } ?? "—")
            .font(.bbnMono.weight(.semibold))
            .foregroundColor(color)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
    }

    private var color: Color { Color.bbnTier(forScore: score ?? 0) }
}
