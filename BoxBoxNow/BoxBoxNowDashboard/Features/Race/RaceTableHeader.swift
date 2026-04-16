import SwiftUI

struct RaceTableHeader: View {
    var body: some View {
        HStack(spacing: 0) {
            cell("Pos", width: 36, align: .center)
            cell("Kart", width: 56, align: .leading)
            cell("Piloto / Equipo", width: nil, align: .leading)
            cell("Media", width: 76, align: .trailing)
            cell("Mejor 3", width: 76, align: .trailing)
            cell("Última", width: 76, align: .trailing)
            cell("Mejor", width: 76, align: .trailing)
            cell("Vueltas", width: 52, align: .trailing)
            cell("Pits", width: 36, align: .trailing)
            cell("Tier", width: 44, align: .center)
            cell("Stint", width: 90, align: .trailing)
            cell("", width: 28, align: .center) // pit status dot
        }
        .font(BBNTypography.caption)
        .foregroundStyle(BBNColors.textMuted)
        .padding(.vertical, 8)
        .padding(.horizontal, 8)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private func cell(_ text: String, width: CGFloat?, align: Alignment) -> some View {
        if let width {
            Text(text).frame(width: width, alignment: align)
        } else {
            Text(text).frame(maxWidth: .infinity, alignment: align)
        }
    }
}
