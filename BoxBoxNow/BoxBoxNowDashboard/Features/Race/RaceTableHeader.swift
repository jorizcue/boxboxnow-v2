import SwiftUI

struct RaceTableHeader: View {
    var body: some View {
        HStack(spacing: 0) {
            cell("Pos", width: 48, align: .leading)
            cell("Kart", width: 72, align: .leading)
            cell("Piloto / Equipo", width: nil, align: .leading)
            cell("Última", width: 80, align: .trailing)
            cell("Mejor", width: 80, align: .trailing)
            cell("Gap", width: 80, align: .trailing)
            cell("Int", width: 80, align: .trailing)
            cell("Vueltas", width: 64, align: .trailing)
            cell("Pits", width: 48, align: .trailing)
        }
        .font(BBNTypography.caption)
        .foregroundStyle(BBNColors.textMuted)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
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
