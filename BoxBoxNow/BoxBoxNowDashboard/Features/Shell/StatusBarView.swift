import SwiftUI

struct StatusBarView: View {
    @Environment(AppStore.self) private var app

    /// Derived connection state for the badge. `RaceStore` exposes
    /// `isConnected` + `reconnectReason`; this enum collapses those into the
    /// four UI states we care about.
    private enum DisplayState {
        case connected
        case connecting
        case reconnecting
        case terminated
    }

    private var displayState: DisplayState {
        if app.race.isConnected { return .connected }
        guard let reason = app.race.reconnectReason else { return .connecting }
        switch reason {
        case .sessionTerminated, .maxDevices:
            return .terminated
        case .normal, .networkError:
            return .reconnecting
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            connectionBadge
            Spacer()
            accountMenu
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(BBNColors.surface)
        .overlay(
            Rectangle()
                .fill(BBNColors.border)
                .frame(height: 0.5),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private var connectionBadge: some View {
        let state = displayState
        HStack(spacing: 6) {
            Circle()
                .fill(badgeColor(state))
                .frame(width: 8, height: 8)
            Text(badgeText(state))
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textPrimary)
        }
    }

    private var accountMenu: some View {
        Menu {
            if let user = app.auth.user {
                Text(user.email ?? user.username).font(BBNTypography.caption)
                Divider()
                Button("Cerrar sesión", role: .destructive) {
                    Task { await app.auth.logout() }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "person.crop.circle.fill")
                    .foregroundStyle(BBNColors.accent)
                Text(app.auth.user?.username ?? "—")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
            }
        }
    }

    private func badgeColor(_ s: DisplayState) -> Color {
        switch s {
        case .connected:   return BBNColors.accent
        case .connecting:  return BBNColors.warning
        case .reconnecting: return BBNColors.warning
        case .terminated:  return BBNColors.danger
        }
    }

    private func badgeText(_ s: DisplayState) -> String {
        switch s {
        case .connected:    return "Conectado"
        case .connecting:   return "Conectando…"
        case .reconnecting: return "Reconectando…"
        case .terminated:   return "Sesión terminada"
        }
    }
}
