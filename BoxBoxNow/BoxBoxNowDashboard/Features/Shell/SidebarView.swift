import SwiftUI

struct SidebarView: View {
    @Environment(AppStore.self) private var app
    @Binding var selection: SidebarItem?

    var body: some View {
        List(selection: $selection) {
            ForEach(SidebarSection.allCases) { section in
                let items = allowedItems(in: section)
                if !items.isEmpty {
                    Section(header:
                        Text(section.rawValue)
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    ) {
                        ForEach(items) { item in
                            NavigationLink(value: item) {
                                Label(item.title, systemImage: item.systemIcon)
                                    .foregroundStyle(BBNColors.textPrimary)
                            }
                            .listRowBackground(BBNColors.surface)
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(BBNColors.background)
        .navigationTitle("BoxBoxNow")
    }

    private func allowedItems(in section: SidebarSection) -> [SidebarItem] {
        let user = app.auth.user
        let isAdmin = user?.isAdmin == true
        let tabs = Set(user?.tabAccess ?? [])
        return SidebarItem.allCases.filter { item in
            guard item.section == section else { return false }
            if item.requiresAdmin { return isAdmin && tabs.contains(item.tabSlug) }
            return tabs.contains(item.tabSlug)
        }
    }
}
