import SwiftUI

struct BBNNumericField: View {
    let label: String
    @Binding var value: Double
    var step: Double = 1
    var formatter: NumberFormatter = BBNNumericField.defaultFormatter

    /// Default decimal formatter. Locked to `es_ES` because the dashboard
    /// is Spanish-only in v1 (no i18n hooks elsewhere in the codebase).
    /// Exposed as `static` so future consumers who want a non-default
    /// formatter can compose against a single shared base instead of
    /// re-creating `NumberFormatter` in every call site.
    static let defaultFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.maximumFractionDigits = 2
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "es_ES")
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(BBNTypography.caption).foregroundColor(BBNColors.textMuted)
            TextField("", value: $value, formatter: formatter)
                .keyboardType(.decimalPad)
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundColor(BBNColors.textPrimary)
                .padding(8)
                .background(BBNColors.surface)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(BBNColors.border, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
}
