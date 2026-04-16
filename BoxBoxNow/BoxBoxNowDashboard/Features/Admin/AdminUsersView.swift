import SwiftUI

struct AdminUsersView: View {
    @Environment(AppStore.self) private var app
    @State private var searchText = ""
    @State private var selectedUser: UserListItem?

    private var store: AdminStore? { app.admin }

    private var filteredUsers: [UserListItem] {
        guard let users = store?.users else { return [] }
        if searchText.isEmpty { return users }
        let query = searchText.lowercased()
        return users.filter {
            $0.username.lowercased().contains(query) ||
            ($0.email?.lowercased().contains(query) ?? false)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            searchBar
            content
        }
        .background(BBNColors.background)
        .task { await store?.refreshUsers() }
        .sheet(item: $selectedUser) { user in
            UserDetailSheet(user: user)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            HStack(spacing: 8) {
                Text("Usuarios")
                    .font(BBNTypography.title2)
                    .foregroundColor(BBNColors.textPrimary)
                if let count = store?.users.count, count > 0 {
                    Text("\(count)")
                        .font(BBNTypography.caption)
                        .foregroundColor(.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(BBNColors.accent)
                        .clipShape(Capsule())
                }
            }
            Spacer()
            Button {
                Task { await store?.refreshUsers() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .foregroundColor(BBNColors.textMuted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Search

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(BBNColors.textDim)
            TextField("Buscar por nombre o email...", text: $searchText)
                .font(BBNTypography.body)
                .foregroundColor(BBNColors.textPrimary)
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(BBNColors.textDim)
                }
            }
        }
        .padding(10)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(BBNColors.border, lineWidth: 1))
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if store?.isLoading == true && (store?.users.isEmpty ?? true) {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if filteredUsers.isEmpty {
            BBNEmptyState(
                icon: "person.slash",
                title: "Sin usuarios",
                subtitle: searchText.isEmpty ? nil : "No se encontraron resultados para \"\(searchText)\""
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(filteredUsers) { user in
                        userRow(user)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    // MARK: - Row

    private func userRow(_ user: UserListItem) -> some View {
        Button {
            selectedUser = user
        } label: {
            BBNCard {
                HStack(spacing: 12) {
                    // Avatar placeholder
                    Circle()
                        .fill(BBNColors.surface)
                        .frame(width: 40, height: 40)
                        .overlay(
                            Text(String(user.username.prefix(1)).uppercased())
                                .font(BBNTypography.bodyBold)
                                .foregroundColor(BBNColors.accent)
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.username)
                            .font(BBNTypography.bodyBold)
                            .foregroundColor(BBNColors.textPrimary)
                        Text(user.email ?? "Sin email")
                            .font(BBNTypography.caption)
                            .foregroundColor(BBNColors.textDim)
                    }

                    Spacer()

                    HStack(spacing: 6) {
                        if user.isAdmin {
                            badge("Admin", color: BBNColors.accent)
                        }
                        if user.hasActiveSubscription == true, let plan = user.subscriptionPlan {
                            badge(plan, color: BBNColors.success)
                        }
                        if let tabs = user.tabAccess {
                            Text("\(tabs.count) tabs")
                                .font(BBNTypography.caption)
                                .foregroundColor(BBNColors.textDim)
                        }
                    }

                    Image(systemName: "chevron.right")
                        .font(BBNTypography.caption)
                        .foregroundColor(BBNColors.textDim)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(BBNTypography.caption)
            .foregroundColor(.black)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(color)
            .clipShape(Capsule())
    }
}
