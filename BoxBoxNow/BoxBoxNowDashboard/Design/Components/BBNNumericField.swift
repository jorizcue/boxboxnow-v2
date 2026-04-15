import SwiftUI

struct BBNNumericField: View {
    let label: String
    @Binding var value: Double
    var step: Double = 1
    var formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.maximumFractionDigits = 2
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "es_ES")
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.bbnCaption).foregroundColor(.bbnTextMuted)
            TextField("", value: $value, formatter: formatter)
                .keyboardType(.decimalPad)
                .font(.bbnMono)
                .foregroundColor(.bbnText)
                .padding(8)
                .background(Color.bbnSurface)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.bbnBorder, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
}
