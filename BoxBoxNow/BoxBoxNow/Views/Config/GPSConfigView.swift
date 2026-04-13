import SwiftUI
import CoreBluetooth
import CoreLocation

struct GPSConfigView: View {
    @EnvironmentObject var gpsVM: GPSViewModel
    @EnvironmentObject var toast: ToastManager
    @State private var connectingDeviceId: UUID?

    var body: some View {
        Form {
            Section("Fuente GPS") {
                Picker("Fuente", selection: $gpsVM.source) {
                    ForEach(GPSSource.allCases, id: \.self) { src in
                        Text(src.displayName).tag(src)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: gpsVM.source) {
                    gpsVM.selectSource(gpsVM.source)
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

                    if gpsVM.bleManager.discoveredDevices.isEmpty && !gpsVM.bleManager.isScanning {
                        VStack(spacing: 6) {
                            Text("No se encontraron dispositivos")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                            Text("Asegurate de que tu RaceBox esta encendido y cerca")
                                .font(.caption)
                                .foregroundColor(Color(.systemGray3))
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }

                    ForEach(gpsVM.bleManager.discoveredDevices, id: \.identifier) { device in
                        Button(action: { connectToDevice(device) }) {
                            HStack {
                                Text(device.name ?? "Desconocido")
                                Spacer()
                                if connectingDeviceId == device.identifier {
                                    ProgressView()
                                } else if gpsVM.bleManager.connectedDevice?.identifier == device.identifier {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.accentColor)
                                }
                            }
                            .frame(minHeight: 44)
                        }
                        .disabled(connectingDeviceId != nil)
                        .accessibilityLabel(
                            gpsVM.bleManager.connectedDevice?.identifier == device.identifier
                                ? "\(device.name ?? "Dispositivo"), conectado"
                                : "Conectar a \(device.name ?? "dispositivo desconocido")"
                        )
                    }

                    if !gpsVM.bleManager.isScanning && gpsVM.bleManager.connectedDevice == nil {
                        Button("Buscar dispositivos") {
                            gpsVM.bleManager.startScan()
                        }
                        .frame(minHeight: 44)
                    }
                }
            }

            if gpsVM.source == .phone {
                Section("GPS del telefono") {
                    HStack {
                        Text("Estado")
                        Spacer()
                        HStack(spacing: 6) {
                            Circle()
                                .fill(gpsVM.phoneGPS.authorizationStatus == .authorizedWhenInUse ? Color.green : Color.orange)
                                .frame(width: 8, height: 8)
                            Text(gpsVM.phoneGPS.authorizationStatus == .authorizedWhenInUse ? "Autorizado" : "Pendiente")
                                .foregroundColor(.gray)
                        }
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
                        // TODO: Wire calibration through gpsVM
                    }
                    .disabled(true)
                    .frame(minHeight: 44)

                    Text("La calibracion automatica estara disponible en una futura actualizacion")
                        .font(.caption)
                        .foregroundColor(Color(.systemGray3))
                }
            }
        }
        .navigationTitle("GPS / RaceBox")
    }

    private var calibPhaseText: String {
        "Pendiente"
    }

    private func connectToDevice(_ device: CBPeripheral) {
        connectingDeviceId = device.identifier
        gpsVM.bleManager.connect(device)
        // Check connection after a timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            connectingDeviceId = nil
            if gpsVM.bleManager.connectedDevice?.identifier == device.identifier {
                toast.success("Conectado a \(device.name ?? "dispositivo")")
            } else {
                toast.error("No se pudo conectar a \(device.name ?? "dispositivo")")
            }
        }
    }
}
