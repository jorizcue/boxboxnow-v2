import SwiftUI

struct DriverMenuOverlay: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @ObservedObject var speech: DriverSpeechService
    @Binding var isPresented: Bool
    var onDismiss: () -> Void

    var body: some View {
        HStack {
            Spacer()

            VStack(alignment: .leading, spacing: 20) {
                Text("Menu")
                    .font(.title2.bold())
                    .foregroundColor(.white)

                // Preset selector
                VStack(alignment: .leading, spacing: 8) {
                    Text("Plantilla")
                        .font(.caption)
                        .foregroundColor(.gray)

                    if !driverVM.presets.isEmpty {
                        Picker("Plantilla", selection: $driverVM.selectedPresetId) {
                            Text("Ninguna").tag(nil as Int?)
                            ForEach(driverVM.presets) { p in
                                Text(p.name).tag(p.id as Int?)
                            }
                        }
                        .pickerStyle(.menu)
                        .onChange(of: driverVM.selectedPresetId) {
                            if let id = driverVM.selectedPresetId, let preset = driverVM.presets.first(where: { $0.id == id }) {
                                driverVM.applyPreset(preset)
                            }
                        }
                    }
                }

                // Contrast boost
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Contraste")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Spacer()
                        Text(driverVM.brightness == 0 ? "Normal" : "+\(Int(driverVM.brightness * 100))%")
                            .font(.caption.monospacedDigit())
                            .foregroundColor(.white)
                    }
                    Slider(value: $driverVM.brightness, in: 0...1.0, step: 0.05)
                        .accentColor(.accentColor)
                }

                // Orientation
                VStack(alignment: .leading, spacing: 8) {
                    Text("Orientacion")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Picker("", selection: $driverVM.orientationLock) {
                        ForEach(OrientationLock.allCases, id: \.self) { o in
                            Text(o.displayName).tag(o)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // Audio narration toggle
                Toggle(isOn: $speech.enabled) {
                    HStack(spacing: 8) {
                        Image(systemName: speech.enabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                            .foregroundColor(speech.enabled ? .accentColor : .gray)
                        Text("Audio")
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                }
                .tint(.accentColor)

                Spacer()

                Button(action: {
                    driverVM.saveConfig()
                    isPresented = false
                    onDismiss()
                }) {
                    HStack {
                        Image(systemName: "arrow.left")
                        Text("Volver")
                    }
                    .foregroundColor(.red)
                }
            }
            .padding(24)
            .frame(width: 280)
            .background(Color(.systemGray6).opacity(0.95))
        }
        .transition(.move(edge: .trailing))
        .animation(.easeInOut(duration: 0.25), value: isPresented)
    }
}
