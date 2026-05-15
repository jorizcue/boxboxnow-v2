import SwiftUI

struct PresetsView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var lang: LanguageStore
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
                                Text(t("preset.cardsCount", lang.current, params: [
                                    "count": String(preset.visibleCards.filter { $0.value }.count),
                                ]))
                                    .font(.caption).foregroundColor(.gray)
                            }
                            Spacer()
                        }
                    }
                }
                .onDelete(perform: deletePresets)
            } header: {
                Text(t("preset.cardSubtitle", lang.current, params: [
                    "n": String(driverVM.presets.count),
                    "max": String(Constants.maxPresets),
                ]))
            }

            Section {
                Button(action: { showSaveSheet = true }) {
                    Label(t("preset.saveCurrent", lang.current), systemImage: "square.and.arrow.down")
                }
                .disabled(driverVM.presets.count >= Constants.maxPresets)
            }
        }
        .navigationTitle(t("preset.titlePlural", lang.current))
        .task { await driverVM.loadPresets() }
        .alert(t("preset.savePreset", lang.current), isPresented: $showSaveSheet) {
            TextField(t("session.name", lang.current), text: $presetName)
            Button(t("common.save", lang.current)) { savePreset() }
            Button(t("common.cancel", lang.current), role: .cancel) { presetName = "" }
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
