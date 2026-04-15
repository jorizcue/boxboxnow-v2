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
                    Text(title).font(.bbnTitle).foregroundColor(.bbnText)
                    if let subtitle {
                        Text(subtitle).font(.bbnCaption).foregroundColor(.bbnTextMuted)
                    }
                }
                Spacer()
            }
            content()
        }
        .padding(.vertical, 16)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.bbnBorder).frame(height: 1)
        }
    }
}
