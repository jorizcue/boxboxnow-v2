import SwiftUI

struct BBNCard<Content: View>: View {
    let content: () -> Content
    init(@ViewBuilder _ content: @escaping () -> Content) { self.content = content }

    var body: some View {
        content()
            .padding(12)
            .background(BBNColors.card)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(BBNColors.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
