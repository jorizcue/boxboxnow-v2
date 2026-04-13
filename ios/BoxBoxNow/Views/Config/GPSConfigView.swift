import SwiftUI

struct GPSConfigView: View {
    @EnvironmentObject var gpsVM: GPSViewModel

    var body: some View {
        Form {
            Section("Fuente GPS") {
                Picker("Fuente", selection: $gpsVM.source) {
                    ForEach(GPSSource.allCases, id: \.self) { src in
                        Text(src.displayName).tag(src)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: gpsVM.source) { newVal in
                    gpsVM.selectSource(newVal)
                }
            }

            if gpsVM.source == .racebox {
                Section("RaceBox BLE") {
                    if gpsVM.bleManager.isScanning {
                        HStack {
                            ProgressView()
                            Text("Buscando dispositivos...")
                                .foregroundColor(.gray)
                        }
                    }

                    ForEach(gpsVM.bleManager.discoveredDevices, id: \.identifier) { device in
                        Button(action: { gpsVM.bleManager.connect(device) }) {
                            HStack {
                                Text(device.name ?? "Desconocido")
                                Spacer()
                                if gpsVM.bleManager.connectedDevice?.identifier == device.identifier {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                    }

                    if !gpsVM.bleManager.isScanning && gpsVM.bleManager.connectedDevice == nil {
                        Button("Buscar dispositivos") {
                            gpsVM.bleManager.startScan()
                        }
                    }
                }
            }

            if gpsVM.source == .phone {
                Section("GPS del telefono") {
                    HStack {
                        Text("Estado")
                        Spacer()
                        Text(gpsVM.phoneGPS.authorizationStatus == .authorizedWhenInUse ? "Autorizado" : "Pendiente")
                            .foregroundColor(.gray)
                    }
                }
            }

            if gpsVM.source != .none {
                Section("Estado") {
                    HStack { Text("Conectado"); Spacer()
                        Image(systemName: gpsVM.isConnected ? "checkmark.circle.fill" : "xmark.circle")
                            .foregroundColor(gpsVM.isConnected ? .green : .red)
                    }
                    HStack { Text("Senal"); Spacer(); Text(gpsVM.signalQuality.displayName).foregroundColor(.gray) }
                    HStack { Text("Frecuencia"); Spacer(); Text("\(Int(gpsVM.sampleRate)) Hz").foregroundColor(.gray) }
                }

                Section("Calibracion IMU") {
                    HStack { Text("Fase"); Spacer()
                        Text(calibPhaseText).foregroundColor(.gray)
                    }
                    Button("Iniciar calibracion") {
                        // Access calibrator through gpsVM
                    }
                }
            }
        }
        .navigationTitle("GPS / RaceBox")
    }

    private var calibPhaseText: String {
        "Pendiente"
    }
}
