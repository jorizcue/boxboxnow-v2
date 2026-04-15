import SwiftUI

struct BBNSection<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    let content: () -> Content

    init(_ title: String, subtitle: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(BBNTypography.title2).foregroundColor(BBNColors.textPrimary)
                    if let subtitle {
                        Text(subtitle).font(BBNTypography.caption).foregroundColor(BBNColors.textMuted)
                    }
                }
                Spacer()
            }
            content()
        }
        .padding(.vertical, 16)
        .overlay(alignment: .bottom) {
            Rectangle().fill(BBNColors.border).frame(height: 1)
        }
    }
}
