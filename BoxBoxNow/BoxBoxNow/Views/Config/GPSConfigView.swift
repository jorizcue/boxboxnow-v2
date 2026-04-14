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
                    // Connected device — show disconnect button
                    if let device = gpsVM.bleManager.connectedDevice {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text(device.name ?? "RaceBox")
                            Spacer()
                            Button("Desconectar") {
                                gpsVM.bleManager.disconnect()
                                gpsVM.isConnected = false
                                gpsVM.signalQuality = .none
                                toast.warning("RaceBox desconectado")
                            }
                            .foregroundColor(.red)
                            .font(.subheadline)
                        }
                        .frame(minHeight: 44)
                    } else {
                        // Scanning / discovery
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
                                    }
                                }
                                .frame(minHeight: 44)
                            }
                            .disabled(connectingDeviceId != nil)
                            .accessibilityLabel("Conectar a \(device.name ?? "dispositivo desconocido")")
                        }

                        if !gpsVM.bleManager.isScanning {
                            Button("Buscar dispositivos") {
                                gpsVM.bleManager.startScan()
                            }
                            .frame(minHeight: 44)
                        }
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

                    if gpsVM.isConnected {
                        Button("Desconectar GPS", role: .destructive) {
                            gpsVM.selectSource(.none)
                            toast.warning("GPS del telefono desconectado")
                        }
                        .frame(minHeight: 44)
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
            }

            // IMU Calibration — only for RaceBox (phone GPS doesn't have an external IMU)
            if gpsVM.source == .racebox {
                Section("Calibracion IMU") {
                    HStack {
                        Text("Fase")
                        Spacer()
                        HStack(spacing: 6) {
                            Circle()
                                .fill(calibPhaseColor)
                                .frame(width: 8, height: 8)
                            Text(calibPhaseText)
                                .foregroundColor(.gray)
                        }
                    }

                    if gpsVM.calibrator.phase == .sampling {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Muestras: \(Int(gpsVM.calibrator.progress * 100))%")
                                .font(.caption)
                                .foregroundColor(.gray)
                            ProgressView(value: gpsVM.calibrator.progress)
                                .tint(.blue)
                        }
                    }

                    if gpsVM.calibrator.phase == .ready {
                        Text("Conduce a mas de 15 km/h para alinear los ejes del dispositivo")
                            .font(.caption)
                            .foregroundColor(.cyan)
                    }

                    if gpsVM.calibrator.phase == .aligned {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Calibracion completa")
                                .foregroundColor(.green)
                        }
                        .font(.subheadline)
                    }

                    // Action buttons
                    if gpsVM.calibrator.phase == .idle {
                        Button("Iniciar calibracion") {
                            gpsVM.calibrator.startCalibration()
                            toast.info("Manten el kart quieto durante la calibracion")
                        }
                        .frame(minHeight: 44)
                        .disabled(gpsVM.bleManager.connectedDevice == nil)

                        if gpsVM.bleManager.connectedDevice == nil {
                            Text("Conecta un RaceBox para calibrar")
                                .font(.caption)
                                .foregroundColor(Color(.systemGray3))
                        }
                    } else if gpsVM.calibrator.phase == .sampling {
                        Text("Manten el kart quieto...")
                            .font(.caption)
                            .foregroundColor(.blue)
                    } else if gpsVM.calibrator.phase == .ready {
                        Button("Omitir alineacion") {
                            gpsVM.calibrator.skipAlignment()
                            toast.success("Calibracion completada (sin alineacion)")
                        }
                        .frame(minHeight: 44)
                    } else if gpsVM.calibrator.phase == .aligned {
                        Button("Recalibrar") {
                            gpsVM.calibrator.reset()
                            gpsVM.calibrator.startCalibration()
                            toast.info("Recalibrando — manten el kart quieto")
                        }
                        .frame(minHeight: 44)
                    }

                    Button("Resetear calibracion", role: .destructive) {
                        gpsVM.calibrator.reset()
                        toast.warning("Calibracion reseteada")
                    }
                    .frame(minHeight: 44)
                    .disabled(gpsVM.calibrator.phase == .idle)
                }
            }
        }
        .navigationTitle("GPS / RaceBox")
    }

    private var calibPhaseText: String {
        switch gpsVM.calibrator.phase {
        case .idle: return "Sin calibrar"
        case .sampling: return "Capturando gravedad..."
        case .ready: return "Gravedad OK — alineando"
        case .aligned: return "Calibrado"
        }
    }

    private var calibPhaseColor: Color {
        switch gpsVM.calibrator.phase {
        case .idle: return .gray
        case .sampling: return .blue
        case .ready: return .cyan
        case .aligned: return .green
        }
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
