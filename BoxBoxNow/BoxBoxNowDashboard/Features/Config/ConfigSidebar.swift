import SwiftUI

/// Secondary sidebar shown inside the Config tab's split view. Renders the
/// five config sub-tabs as selectable rows with a Spanish header label and
/// accent-highlight on the active selection.
struct ConfigSidebar: View {
    @Binding var selection: ConfigSubTab

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Configuración")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textMuted)
                .padding(.horizontal, 12)
                .padding(.top, 12)

            ForEach(ConfigSubTab.allCases) { tab in
                Button {
                    selection = tab
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: tab.icon)
                            .frame(width: 20)
                        Text(tab.title)
                            .font(BBNTypography.body)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .foregroundStyle(selection == tab ? BBNColors.accent : BBNColors.textPrimary)
                    .background(selection == tab ? BBNColors.accent.opacity(0.12) : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(selection == tab ? "Sub-tab seleccionada" : "Cambia a \(tab.title)")
            }

            Spacer()
        }
        .padding(.horizontal, 8)
        .frame(width: 220)
        .background(BBNColors.surface)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sub-tabs de configuración")
    }
}
