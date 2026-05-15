import SwiftUI

struct PresetsView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var toast: ToastManager
    @EnvironmentObject var auth: AuthViewModel
    @EnvironmentObject var langStore: LanguageStore
    @State private var showWizard = false
    @State private var editingPreset: DriverConfigPreset?
    @State private var isLoading = true
    @State private var presetToDelete: DriverConfigPreset?

    var body: some View {
        List {
            Section {
                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                } else if driverVM.presets.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 32))
                            .foregroundColor(Color(.systemGray3))
                        Text(t("preset.title"))
                            .font(.subheadline.bold())
                            .foregroundColor(.gray)
                        Text(t("preset.empty"))
                            .font(.caption)
                            .foregroundColor(Color(.systemGray2))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(driverVM.presets) { preset in
                        HStack(spacing: 12) {
                            // Star toggle — mark as default (auto-applies on DriverView.onAppear)
                            Button(action: { toggleDefault(preset) }) {
                                Image(systemName: preset.isDefault ? "star.fill" : "star")
                                    .font(.system(size: 17))
                                    .foregroundColor(preset.isDefault ? .accentColor : Color(.systemGray2))
                                    .frame(width: 32, height: 32)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(preset.isDefault ? t("preset.starOn") : t("preset.starOff"))

                            Button(action: {
                                driverVM.applyPreset(preset)
                                toast.success("Plantilla \"\(preset.name)\" aplicada")
                            }) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(preset.name).foregroundColor(.white)
                                        }
                                        Text(t("preset.cards", ["count": String(preset.visibleCards.filter { $0.value }.count)]))
                                            .font(.caption).foregroundColor(.gray)
                                    }
                                    Spacer()
                                }
                                .frame(minHeight: 44)
                            }
                            .accessibilityLabel("\(preset.name), \(t("preset.cards", ["count": String(preset.visibleCards.filter { $0.value }.count)]))")

                            // Edit button
                            Button(action: { editingPreset = preset }) {
                                Image(systemName: "pencil.circle")
                                    .font(.system(size: 22))
                                    .foregroundColor(.accentColor)
                                    .frame(width: 36, height: 36)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(t("common.edit"))
                        }
                    }
                    .onDelete(perform: confirmDelete)
                }
            } header: {
                Text(t("preset.header", ["count": String(driverVM.presets.count), "max": String(Constants.maxPresets)]))
            }

            Section {
                Button(action: { showWizard = true }) {
                    Label(t("preset.createNew"), systemImage: "plus.circle.fill")
                        .frame(minHeight: 44)
                }
                .disabled(driverVM.presets.count >= Constants.maxPresets)
                .accessibilityLabel(t("preset.createNew"))
            }
        }
        .navigationTitle(t("preset.title"))
        .task {
            await driverVM.loadPresets()
            isLoading = false
        }
        .sheet(isPresented: $showWizard) {
            TemplateWizardView()
                .environmentObject(driverVM)
                .environmentObject(auth)
                .environmentObject(toast)
                .onDisappear {
                    Task { await driverVM.loadPresets() }
                }
        }
        .sheet(item: $editingPreset) { preset in
            TemplateWizardView(editingPreset: preset)
                .environmentObject(driverVM)
                .environmentObject(auth)
                .environmentObject(toast)
                .onDisappear {
                    Task { await driverVM.loadPresets() }
                }
        }
        .alert(t("preset.deleteTitle"), isPresented: .init(
            get: { presetToDelete != nil },
            set: { if !$0 { presetToDelete = nil } }
        )) {
            Button(t("common.delete"), role: .destructive) {
                if let preset = presetToDelete { deletePreset(preset) }
            }
            Button(t("common.cancel"), role: .cancel) { presetToDelete = nil }
        } message: {
            if let preset = presetToDelete {
                Text(t("preset.deleteConfirm", ["name": preset.name]))
            }
        }
    }

    private func confirmDelete(at offsets: IndexSet) {
        guard let idx = offsets.first else { return }
        presetToDelete = driverVM.presets[idx]
    }

    private func toggleDefault(_ preset: DriverConfigPreset) {
        let want = !preset.isDefault
        Task {
            do {
                try await driverVM.setPresetDefault(preset, isDefault: want)
                await MainActor.run {
                    toast.success(want
                        ? "\"\(preset.name)\" marcada como predefinida"
                        : "Predefinida eliminada")
                }
            } catch {
                await MainActor.run {
                    toast.error("Error: \(error.localizedDescription)")
                }
            }
        }
    }

    private func deletePreset(_ preset: DriverConfigPreset) {
        Task {
            do {
                try await driverVM.deletePreset(preset)
                await MainActor.run {
                    toast.success("Plantilla eliminada")
                    presetToDelete = nil
                }
            } catch {
                await MainActor.run {
                    toast.error("Error al eliminar: \(error.localizedDescription)")
                    presetToDelete = nil
                }
            }
        }
    }
}
