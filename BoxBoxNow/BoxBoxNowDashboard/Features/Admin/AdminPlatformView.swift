import SwiftUI

struct AdminPlatformView: View {
    @Environment(AppStore.self) private var app

    private var store: AdminStore? { app.admin }
    private var settings: [String: String] { store?.platformSettings ?? [:] }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await store?.loadPlatformSettings() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Plataforma")
                .font(BBNTypography.title2)
                .foregroundColor(BBNColors.textPrimary)
            Spacer()
            Button {
                Task { await store?.loadPlatformSettings() }
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
        if store?.isLoading == true && settings.isEmpty {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if settings.isEmpty {
            BBNEmptyState(
                icon: "gearshape",
                title: "Sin configuracion",
                subtitle: "No se pudieron cargar los ajustes de plataforma",
                action: .init(title: "Reintentar") {
                    Task { await store?.loadPlatformSettings() }
                }
            )
        } else {
            ScrollView {
                VStack(spacing: 16) {
                    trialSection
                    defaultsSection
                    trialTabsSection
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    // MARK: - Trial Section

    private var trialSection: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Periodo de prueba", systemImage: "clock.badge.questionmark")
                    .font(BBNTypography.title3)
                    .foregroundColor(BBNColors.textPrimary)

                settingRow(label: "Dias de prueba", key: "trial_days", icon: "calendar")
                settingRow(label: "Dias banner aviso", key: "trial_banner_days", icon: "exclamationmark.bubble")
                settingRow(label: "Dias email aviso", key: "trial_email_days", icon: "envelope.badge")
            }
        }
    }

    // MARK: - Defaults Section

    private var defaultsSection: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Valores por defecto", systemImage: "slider.horizontal.3")
                    .font(BBNTypography.title3)
                    .foregroundColor(BBNColors.textPrimary)

                settingRow(label: "Max dispositivos", key: "default_max_devices", icon: "ipad.and.iphone")
                settingRow(label: "Max dispositivos (trial)", key: "trial_max_devices", icon: "ipad")
            }
        }
    }

    // MARK: - Trial Tabs Section

    private var trialTabsSection: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Pestanas por defecto", systemImage: "rectangle.grid.1x2")
                    .font(BBNTypography.title3)
                    .foregroundColor(BBNColors.textPrimary)

                if let defaultTabs = settings["default_tabs"] {
                    tabList(title: "Tabs regulares", value: defaultTabs)
                }

                if let trialTabs = settings["trial_tabs"] {
                    tabList(title: "Tabs periodo prueba", value: trialTabs)
                }
            }
        }
    }

    // MARK: - Helpers

    private func settingRow(label: String, key: String, icon: String) -> some View {
        HStack {
            Label(label, systemImage: icon)
                .font(BBNTypography.body)
                .foregroundColor(BBNColors.textMuted)
            Spacer()
            Text(settings[key] ?? "-")
                .font(BBNTypography.bodyBold)
                .monospacedDigit()
                .foregroundColor(BBNColors.textPrimary)
        }
        .padding(.vertical, 2)
    }

    private func tabList(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(BBNTypography.caption)
                .foregroundColor(BBNColors.textDim)

            let tabs = parseTabs(value)
            if tabs.isEmpty {
                Text("Ninguna")
                    .font(BBNTypography.caption)
                    .foregroundColor(BBNColors.textDim)
            } else {
                WrappingHStack(tabs: tabs)
            }
        }
    }

    private func parseTabs(_ raw: String) -> [String] {
        // Could be JSON array or comma-separated
        let cleaned = raw
            .trimmingCharacters(in: CharacterSet(charactersIn: "[]\""))
            .replacingOccurrences(of: "\"", with: "")
        return cleaned
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}

// MARK: - WrappingHStack

private struct WrappingHStack: View {
    let tabs: [String]

    var body: some View {
        FlowLayoutView(spacing: 6) {
            ForEach(tabs, id: \.self) { tab in
                Text(tab)
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

private struct FlowLayoutView: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (i, pos) in result.positions.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + pos.x, y: bounds.minY + pos.y),
                              proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (positions: [CGPoint], size: CGSize) {
        let maxW = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        var totalW: CGFloat = 0

        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x + s.width > maxW && x > 0 {
                x = 0; y += rowH + spacing; rowH = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowH = max(rowH, s.height)
            x += s.width + spacing
            totalW = max(totalW, x - spacing)
        }
        return (positions, CGSize(width: totalW, height: y + rowH))
    }
}
