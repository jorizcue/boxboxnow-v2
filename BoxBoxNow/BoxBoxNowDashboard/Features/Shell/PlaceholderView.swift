import SwiftUI

struct PlaceholderView: View {
    let text: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "square.dashed")
                .font(.system(size: 48))
                .foregroundStyle(BBNColors.textMuted)
            Text(text)
                .font(BBNTypography.body)
                .foregroundStyle(BBNColors.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background)
    }
}
