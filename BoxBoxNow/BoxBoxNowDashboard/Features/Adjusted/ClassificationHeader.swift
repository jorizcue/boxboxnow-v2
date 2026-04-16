import SwiftUI

/// Sticky column-title header shared by both Adjusted classification views.
/// The caller passes a `(title, width)` tuple per column; `width == nil`
/// means the column flexes to fill remaining space.
struct ClassificationHeader: View {
    struct Column: Identifiable {
        var id: String { title }
        let title: String
        let width: CGFloat?
        let align: Alignment
    }

    let columns: [Column]

    var body: some View {
        HStack(spacing: 12) {
            ForEach(columns) { col in
                Group {
                    if let w = col.width {
                        Text(col.title).frame(width: w, alignment: col.align)
                    } else {
                        Text(col.title).frame(maxWidth: .infinity, alignment: col.align)
                    }
                }
            }
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
}
