import SwiftUI

struct BBNSecondaryButton: View {
    let title: String
    var icon: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon) }
                Text(title).font(.bbnHeadline.weight(.medium))
            }
            .foregroundColor(.bbnText)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.bbnSurface)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.bbnBorder, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}
