import SwiftUI

struct AdminHubView: View {
    @Environment(AppStore.self) private var app

    private var store: AdminStore? { app.admin }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await store?.loadHubStatus() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Circuit Hub")
                .font(BBNTypography.title2)
                .foregroundColor(BBNColors.textPrimary)
            Spacer()
            if store?.isLoadingHub == true {
                ProgressView()
                    .tint(BBNColors.accent)
                    .scaleEffect(0.8)
            }
            Button {
                Task { await store?.loadHubStatus() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .foregroundColor(BBNColors.textMuted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if store?.isLoadingHub == true && (store?.hubStatuses.isEmpty ?? true) {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store?.hubStatuses.isEmpty ?? true {
            BBNEmptyState(
                icon: "antenna.radiowaves.left.and.right.slash",
                title: "Sin conexiones",
                subtitle: "No hay circuitos conectados al hub"
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(store?.hubStatuses ?? []) { status in
                        hubCard(status)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    // MARK: - Hub Card

    private func hubCard(_ status: HubCircuitStatus) -> some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                // Header row
                HStack {
                    BBNStatusDot(
                        isOn: status.connected,
                        label: status.connected ? "Conectado" : "Desconectado"
                    )
                    Spacer()
                    Text(status.circuitName)
                        .font(BBNTypography.bodyBold)
                        .foregroundColor(BBNColors.textPrimary)
                    Spacer()
                    toggleButton(status)
                }

                // Stats row
                HStack(spacing: 16) {
                    statPill(icon: "person.2", value: "\(status.subscribers)")
                    statPill(icon: "message", value: "\(status.messages)")
                    statPill(icon: "link", value: status.wsUrl)
                }

                // Connected users
                if !status.connectedUsers.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Usuarios conectados")
                            .font(BBNTypography.caption)
                            .foregroundColor(BBNColors.textDim)

                        BBNFlowLayout(spacing: 6) {
                            ForEach(status.connectedUsers) { user in
                                Text(user.username)
                                    .font(BBNTypography.caption)
                                    .foregroundColor(BBNColors.textPrimary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(BBNColors.surface)
                                    .clipShape(Capsule())
                                    .overlay(Capsule().stroke(BBNColors.border, lineWidth: 1))
                            }
                        }
                    }
                }
            }
        }
    }

    private func toggleButton(_ status: HubCircuitStatus) -> some View {
        Button {
            Task {
                if status.connected {
                    await store?.hubStop(circuitId: status.circuitId)
                } else {
                    await store?.hubStart(circuitId: status.circuitId)
                }
            }
        } label: {
            Text(status.connected ? "Detener" : "Iniciar")
                .font(BBNTypography.caption)
                .foregroundColor(status.connected ? BBNColors.danger : BBNColors.success)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(BBNColors.surface)
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(
                        status.connected ? BBNColors.danger.opacity(0.4) : BBNColors.success.opacity(0.4),
                        lineWidth: 1
                    )
                )
        }
    }

    private func statPill(icon: String, value: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundColor(BBNColors.textDim)
            Text(value)
                .font(BBNTypography.caption)
                .foregroundColor(BBNColors.textMuted)
                .lineLimit(1)
        }
    }
}
