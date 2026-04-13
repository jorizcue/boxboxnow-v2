import SwiftUI

struct DriverMenuOverlay: View {
    @EnvironmentObject var driverVM: DriverViewModel
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
                        .onChange(of: driverVM.selectedPresetId) { newId in
                            if let id = newId, let preset = driverVM.presets.first(where: { $0.id == id }) {
                                driverVM.applyPreset(preset)
                            }
                        }
                    }
                }

                // Brightness
                VStack(alignment: .leading, spacing: 8) {
                    Text("Brillo")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Slider(value: $driverVM.brightness, in: 0.1...1.0)
                        .accentColor(.accentColor)
                        .onChange(of: driverVM.brightness) { val in
                            UIScreen.main.brightness = CGFloat(val)
                        }
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
