import SwiftUI

struct PresetsView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var toast: ToastManager
    @State private var showSaveSheet = false
    @State private var presetName = ""
    @State private var isLoading = true
    @State private var isSaving = false
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
                        Text("Sin plantillas")
                            .font(.subheadline.bold())
                            .foregroundColor(.gray)
                        Text("Guarda tu configuracion actual para aplicarla despues")
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
                            .accessibilityLabel(preset.isDefault ? "Quitar como predefinida" : "Marcar como predefinida")

                            Button(action: {
                                driverVM.applyPreset(preset)
                                toast.success("Plantilla \"\(preset.name)\" aplicada")
                            }) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(preset.name).foregroundColor(.white)
                                            if preset.isDefault {
                                                Text("PREDEFINIDA")
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundColor(.accentColor)
                                            }
                                        }
                                        Text("\(preset.visibleCards.filter { $0.value }.count) tarjetas")
                                            .font(.caption).foregroundColor(.gray)
                                    }
                                    Spacer()
                                    if driverVM.selectedPresetId == preset.id {
                                        Image(systemName: "checkmark")
                                            .foregroundColor(.accentColor)
                                    }
                                }
                                .frame(minHeight: 44)
                            }
                            .accessibilityLabel("Plantilla \(preset.name), \(preset.visibleCards.filter { $0.value }.count) tarjetas\(driverVM.selectedPresetId == preset.id ? ", seleccionada" : "")\(preset.isDefault ? ", predefinida" : "")")
                        }
                    }
                    .onDelete(perform: confirmDelete)
                }
            } header: {
                Text("Plantillas (\(driverVM.presets.count)/\(Constants.maxPresets))")
            }

            Section {
                Button(action: { showSaveSheet = true }) {
                    HStack {
                        Label("Guardar configuracion actual", systemImage: "square.and.arrow.down")
                        if isSaving {
                            Spacer()
                            ProgressView()
                        }
                    }
                    .frame(minHeight: 44)
                }
                .disabled(driverVM.presets.count >= Constants.maxPresets || isSaving)
                .accessibilityLabel("Guardar configuracion actual como plantilla")
            }
        }
        .navigationTitle("Plantillas")
        .task {
            await driverVM.loadPresets()
            isLoading = false
        }
        .alert("Guardar plantilla", isPresented: $showSaveSheet) {
            TextField("Nombre", text: $presetName)
            Button("Guardar") { savePreset() }
            Button("Cancelar", role: .cancel) { presetName = "" }
        }
        .alert("Eliminar plantilla", isPresented: .init(
            get: { presetToDelete != nil },
            set: { if !$0 { presetToDelete = nil } }
        )) {
            Button("Eliminar", role: .destructive) {
                if let preset = presetToDelete { deletePreset(preset) }
            }
            Button("Cancelar", role: .cancel) { presetToDelete = nil }
        } message: {
            if let preset = presetToDelete {
                Text("Se eliminara la plantilla \"\(preset.name)\". Esta accion no se puede deshacer.")
            }
        }
    }

    private func savePreset() {
        guard !presetName.isEmpty else { return }
        isSaving = true
        Task {
            do {
                try await driverVM.saveAsPreset(name: presetName)
                await MainActor.run {
                    toast.success("Plantilla \"\(presetName)\" guardada")
                    presetName = ""
                    isSaving = false
                }
            } catch {
                await MainActor.run {
                    toast.error("Error al guardar: \(error.localizedDescription)")
                    isSaving = false
                }
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
