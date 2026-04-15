import SwiftUI

struct BBNSecondaryButton: View {
    let title: String
    var icon: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon) }
                Text(title).font(BBNTypography.title3.weight(.medium))
            }
            .foregroundColor(BBNColors.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(BBNColors.surface)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(BBNColors.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}
