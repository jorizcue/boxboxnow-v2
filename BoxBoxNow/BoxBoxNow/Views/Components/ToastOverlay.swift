import SwiftUI
import Combine

// MARK: - Toast data model

enum ToastStyle {
    case error, success, warning, info

    var icon: String {
        switch self {
        case .error: return "xmark.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .info: return "info.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .error: return .red
        case .success: return .green
        case .warning: return .orange
        case .info: return .blue
        }
    }
}

struct ToastItem: Identifiable, Equatable {
    let id = UUID()
    let message: String
    let style: ToastStyle
    let duration: TimeInterval

    static func == (lhs: ToastItem, rhs: ToastItem) -> Bool { lhs.id == rhs.id }
}

// MARK: - Toast manager (shared via EnvironmentObject)

final class ToastManager: ObservableObject {
    @Published var current: ToastItem?

    func show(_ message: String, style: ToastStyle = .info, duration: TimeInterval = 3) {
        current = ToastItem(message: message, style: style, duration: duration)
    }

    func error(_ message: String) { show(message, style: .error, duration: 4) }
    func success(_ message: String) { show(message, style: .success) }
    func warning(_ message: String) { show(message, style: .warning) }

    func dismiss() { current = nil }
}

// MARK: - Toast view

struct ToastOverlay: ViewModifier {
    @ObservedObject var manager: ToastManager

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let toast = manager.current {
                ToastBanner(item: toast) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        manager.dismiss()
                    }
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: manager.current)
                .onAppear {
                    DispatchQueue.main.asyncAfter(deadline: .now() + toast.duration) {
                        if manager.current?.id == toast.id {
                            withAnimation { manager.dismiss() }
                        }
                    }
                }
                .zIndex(999)
            }
        }
    }
}

struct ToastBanner: View {
    let item: ToastItem
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: item.style.icon)
                .foregroundColor(item.style.color)
                .font(.system(size: 18))

            Text(item.message)
                .font(.subheadline)
                .foregroundColor(.white)
                .multilineTextAlignment(.leading)
                .lineLimit(3)

            Spacer()

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.gray)
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Cerrar notificacion")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
    }
}

extension View {
    func toast(_ manager: ToastManager) -> some View {
        modifier(ToastOverlay(manager: manager))
    }
}
