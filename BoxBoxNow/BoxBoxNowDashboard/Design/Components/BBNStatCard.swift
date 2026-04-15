import SwiftUI

/// Small statistic card used in detail sheets: a muted caption label and a large mono value.
struct BBNStatCard: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textMuted)
            Text(value)
                .font(BBNTypography.title3)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
