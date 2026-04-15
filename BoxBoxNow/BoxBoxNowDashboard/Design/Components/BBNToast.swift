import SwiftUI

struct BBNToast: View {
    enum Kind { case info, success, error
        var color: Color { switch self { case .info: return .bbnAccent; case .success: return .bbnSuccess; case .error: return .bbnDanger } }
        var icon: String { switch self { case .info: return "info.circle"; case .success: return "checkmark.circle"; case .error: return "xmark.circle" } }
    }
    let kind: Kind
    let message: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: kind.icon).foregroundColor(kind.color)
            Text(message).font(.bbnBody).foregroundColor(.bbnText)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color.bbnCard)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(kind.color, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.5), radius: 8, x: 0, y: 4)
    }
}
