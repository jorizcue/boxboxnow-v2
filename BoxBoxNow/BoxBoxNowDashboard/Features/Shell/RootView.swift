import SwiftUI

struct RootView: View {
    @Environment(AppStore.self) private var app
    @State private var selection: SidebarItem? = nil
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        ZStack {
            NavigationSplitView(columnVisibility: $columnVisibility) {
                SidebarView(selection: $selection)
            } detail: {
                VStack(spacing: 0) {
                    StatusBarView()
                    DetailRouter(item: selection)
                }
            }
            .navigationSplitViewStyle(.balanced)
            .tint(BBNColors.accent)
            .onAppear { selectFirstAvailable() }
            .onChange(of: app.auth.user?.id) { _, _ in selectFirstAvailable() }

            BoxCallOverlay()
        }
        .preferredColorScheme(.dark)
    }

    /// After login (or when user changes) snap to the first sidebar row the
    /// user has permission for. The previous selection may no longer be
    /// visible — clearing it would leave the detail blank.
    private func selectFirstAvailable() {
        guard let user = app.auth.user else { selection = nil; return }
        let tabs = Set(user.tabAccess ?? [])
        let isAdmin = user.isAdmin
        selection = SidebarItem.allCases.first { item in
            if item.requiresAdmin { return isAdmin && tabs.contains(item.tabSlug) }
            return tabs.contains(item.tabSlug)
        }
    }
}
