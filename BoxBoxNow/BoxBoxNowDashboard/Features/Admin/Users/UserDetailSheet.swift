import SwiftUI

struct UserDetailSheet: View {
    @Environment(AppStore.self) private var app
    @Environment(\.dismiss) private var dismiss

    let user: UserListItem

    @State private var isAdmin: Bool
    @State private var maxDevices: Int
    @State private var selectedTabs: Set<String>
    @State private var isSaving = false
    @State private var showDeleteConfirm = false
    @State private var errorMessage: String?

    private static let allTabs: [String] = [
        "race", "pit", "live", "config", "adjusted", "adjusted-beta",
        "driver", "driver-config", "replay", "analytics", "insights"
    ]
    private static let adminTabs: [String] = [
        "admin-users", "admin-circuits", "admin-hub"
    ]

    init(user: UserListItem) {
        self.user = user
        _isAdmin = State(initialValue: user.isAdmin)
        _maxDevices = State(initialValue: user.maxDevices ?? 3)
        _selectedTabs = State(initialValue: Set(user.tabAccess ?? []))
    }

    private var visibleTabs: [String] {
        isAdmin ? Self.allTabs + Self.adminTabs : Self.allTabs
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    userInfoSection
                    adminToggleSection
                    devicesSection
                    tabAccessSection
                    mfaSection
                    dangerSection
                }
                .padding(20)
            }
            .background(BBNColors.background)
            .navigationTitle(user.username)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .foregroundColor(BBNColors.textMuted)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }
                        .foregroundColor(BBNColors.accent)
                        .disabled(isSaving)
                }
            }
            .overlay { BBNLoadingOverlay(isVisible: isSaving, message: "Guardando...") }
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
            .confirmationDialog("Eliminar usuario", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Eliminar", role: .destructive) { Task { await deleteUser() } }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Esta accion no se puede deshacer. Se eliminara el usuario \(user.username) permanentemente.")
            }
        }
    }

    // MARK: - Sections

    private var userInfoSection: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Informacion del usuario")
                    .font(BBNTypography.title3)
                    .foregroundColor(BBNColors.textPrimary)

                HStack {
                    Label("ID", systemImage: "number")
                        .font(BBNTypography.caption)
                        .foregroundColor(BBNColors.textDim)
                    Spacer()
                    Text("\(user.id)")
                        .font(BBNTypography.body)
                        .monospacedDigit()
                        .foregroundColor(BBNColors.textPrimary)
                }

                HStack {
                    Label("Email", systemImage: "envelope")
                        .font(BBNTypography.caption)
                        .foregroundColor(BBNColors.textDim)
                    Spacer()
                    Text(user.email ?? "Sin email")
                        .font(BBNTypography.body)
                        .foregroundColor(user.email != nil ? BBNColors.textPrimary : BBNColors.textDim)
                }

                if let plan = user.subscriptionPlan {
                    HStack {
                        Label("Plan", systemImage: "creditcard")
                            .font(BBNTypography.caption)
                            .foregroundColor(BBNColors.textDim)
                        Spacer()
                        Text(plan)
                            .font(BBNTypography.bodyBold)
                            .foregroundColor(BBNColors.accent)
                    }
                }

                if let created = user.createdAt {
                    HStack {
                        Label("Creado", systemImage: "calendar")
                            .font(BBNTypography.caption)
                            .foregroundColor(BBNColors.textDim)
                        Spacer()
                        Text(created.prefix(10))
                            .font(BBNTypography.body)
                            .foregroundColor(BBNColors.textMuted)
                    }
                }
            }
        }
    }

    private var adminToggleSection: some View {
        BBNCard {
            Toggle(isOn: $isAdmin) {
                HStack(spacing: 8) {
                    Image(systemName: "shield.checkered")
                        .foregroundColor(BBNColors.accent)
                    Text("Administrador")
                        .font(BBNTypography.bodyBold)
                        .foregroundColor(BBNColors.textPrimary)
                }
            }
            .tint(BBNColors.accent)
            .onChange(of: isAdmin) { _, newVal in
                // Remove admin tabs if toggled off
                if !newVal {
                    for tab in Self.adminTabs {
                        selectedTabs.remove(tab)
                    }
                }
            }
        }
    }

    private var devicesSection: some View {
        BBNCard {
            HStack {
                Label("Max dispositivos", systemImage: "ipad.and.iphone")
                    .font(BBNTypography.bodyBold)
                    .foregroundColor(BBNColors.textPrimary)
                Spacer()
                HStack(spacing: 12) {
                    Button {
                        if maxDevices > 1 { maxDevices -= 1 }
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .font(.title2)
                            .foregroundColor(maxDevices > 1 ? BBNColors.textMuted : BBNColors.textDim)
                    }
                    .disabled(maxDevices <= 1)

                    Text("\(maxDevices)")
                        .font(BBNTypography.title3)
                        .monospacedDigit()
                        .foregroundColor(BBNColors.textPrimary)
                        .frame(minWidth: 30)

                    Button {
                        if maxDevices < 20 { maxDevices += 1 }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundColor(maxDevices < 20 ? BBNColors.accent : BBNColors.textDim)
                    }
                    .disabled(maxDevices >= 20)
                }
            }
        }
    }

    private var tabAccessSection: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Acceso a pestanas")
                        .font(BBNTypography.title3)
                        .foregroundColor(BBNColors.textPrimary)
                    Spacer()
                    Text("\(selectedTabs.count) activas")
                        .font(BBNTypography.caption)
                        .foregroundColor(BBNColors.textDim)
                }

                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8)
                ], spacing: 8) {
                    ForEach(visibleTabs, id: \.self) { tab in
                        tabChip(tab)
                    }
                }
            }
        }
    }

    private func tabChip(_ tab: String) -> some View {
        let isSelected = selectedTabs.contains(tab)
        return Button {
            if isSelected {
                selectedTabs.remove(tab)
            } else {
                selectedTabs.insert(tab)
            }
        } label: {
            Text(tab)
                .font(BBNTypography.caption)
                .lineLimit(1)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .foregroundColor(isSelected ? .black : BBNColors.textMuted)
                .background(isSelected ? BBNColors.accent : BBNColors.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isSelected ? Color.clear : BBNColors.border, lineWidth: 1)
                )
        }
    }

    private var mfaSection: some View {
        BBNCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("MFA / 2FA")
                        .font(BBNTypography.bodyBold)
                        .foregroundColor(BBNColors.textPrimary)
                    Text(user.mfaEnabled == true ? "Activado" : "No configurado")
                        .font(BBNTypography.caption)
                        .foregroundColor(user.mfaEnabled == true ? BBNColors.success : BBNColors.textDim)
                }
                Spacer()
                if user.mfaEnabled == true {
                    Button("Resetear MFA") { Task { await resetMfa() } }
                        .font(BBNTypography.caption)
                        .foregroundColor(BBNColors.warning)
                }
            }
        }
    }

    private var dangerSection: some View {
        BBNCard {
            Button {
                showDeleteConfirm = true
            } label: {
                HStack {
                    Image(systemName: "trash")
                    Text("Eliminar usuario")
                        .font(BBNTypography.bodyBold)
                }
                .foregroundColor(BBNColors.danger)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
        }
    }

    // MARK: - Actions

    private func save() async {
        guard let store = app.admin else { return }
        isSaving = true
        defer { isSaving = false }

        do {
            var fields: [String: JSONValue] = [:]
            if isAdmin != user.isAdmin {
                fields["is_admin"] = .bool(isAdmin)
            }
            if maxDevices != (user.maxDevices ?? 3) {
                fields["max_devices"] = .int(maxDevices)
            }
            if !fields.isEmpty {
                try await store.updateUser(id: user.id, fields: fields)
            }

            let newTabs = Array(selectedTabs).sorted()
            let oldTabs = (user.tabAccess ?? []).sorted()
            if newTabs != oldTabs {
                try await store.updateUserTabs(userId: user.id, tabs: newTabs)
            }

            dismiss()
        } catch {
            errorMessage = ErrorMessages.userFacing(error)
        }
    }

    private func deleteUser() async {
        guard let store = app.admin else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await store.deleteUser(id: user.id)
            dismiss()
        } catch {
            errorMessage = ErrorMessages.userFacing(error)
        }
    }

    private func resetMfa() async {
        guard let store = app.admin else { return }
        do {
            try await store.resetMfa(userId: user.id)
        } catch {
            errorMessage = ErrorMessages.userFacing(error)
        }
    }
}
