import SwiftUI

struct BBNEmptyState: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var action: (title: String, handler: () -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 48)).foregroundColor(.bbnTextDim)
            Text(title).font(.bbnTitle).foregroundColor(.bbnText)
            if let subtitle {
                Text(subtitle).font(.bbnBody).foregroundColor(.bbnTextMuted).multilineTextAlignment(.center)
            }
            if let action {
                BBNPrimaryButton(title: action.title, action: action.handler).frame(maxWidth: 240)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }
}
