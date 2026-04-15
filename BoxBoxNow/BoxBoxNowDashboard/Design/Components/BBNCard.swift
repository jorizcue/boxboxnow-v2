import SwiftUI

struct BBNCard<Content: View>: View {
    let content: () -> Content
    init(@ViewBuilder _ content: @escaping () -> Content) { self.content = content }

    var body: some View {
        content()
            .padding(12)
            .background(Color.bbnCard)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.bbnBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
