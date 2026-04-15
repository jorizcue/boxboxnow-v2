import SwiftUI

struct BBNPrimaryButton: View {
    let title: String
    var icon: String? = nil
    var isLoading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().tint(.black)
                } else if let icon {
                    Image(systemName: icon)
                }
                Text(title).font(.bbnHeadline.weight(.semibold))
            }
            .foregroundColor(.black)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.bbnAccent)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(isLoading)
    }
}
