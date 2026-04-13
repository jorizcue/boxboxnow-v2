import SwiftUI

struct PresetsView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @State private var showSaveSheet = false
    @State private var presetName = ""
    @State private var errorMsg: String?

    var body: some View {
        List {
            Section {
                ForEach(driverVM.presets) { preset in
                    Button(action: { driverVM.applyPreset(preset) }) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(preset.name).foregroundColor(.white)
                                Text("\(preset.visibleCards.filter { $0.value }.count) tarjetas")
                                    .font(.caption).foregroundColor(.gray)
                            }
                            Spacer()
                            if driverVM.selectedPresetId == preset.id {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.accentColor)
                            }
                        }
                    }
                }
                .onDelete(perform: deletePresets)
            } header: {
                Text("Plantillas (\(driverVM.presets.count)/\(Constants.maxPresets))")
            }

            Section {
                Button(action: { showSaveSheet = true }) {
                    Label("Guardar configuracion actual", systemImage: "square.and.arrow.down")
                }
                .disabled(driverVM.presets.count >= Constants.maxPresets)
            }
        }
        .navigationTitle("Plantillas")
        .task { await driverVM.loadPresets() }
        .alert("Guardar plantilla", isPresented: $showSaveSheet) {
            TextField("Nombre", text: $presetName)
            Button("Guardar") { savePreset() }
            Button("Cancelar", role: .cancel) { presetName = "" }
        }
    }

    private func savePreset() {
        guard !presetName.isEmpty else { return }
        Task {
            do {
                try await driverVM.saveAsPreset(name: presetName)
                presetName = ""
            } catch {
                errorMsg = error.localizedDescription
            }
        }
    }

    private func deletePresets(at offsets: IndexSet) {
        for idx in offsets {
            let preset = driverVM.presets[idx]
            Task { try? await driverVM.deletePreset(preset) }
        }
    }
}
