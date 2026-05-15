import SwiftUI
import CoreBluetooth
import CoreLocation

struct GPSConfigView: View {
    @EnvironmentObject var gpsVM: GPSViewModel
    @EnvironmentObject var toast: ToastManager
    @EnvironmentObject var langStore: LanguageStore
    @State private var connectingDeviceId: UUID?

    /// Refresh rate (Hz) for the GPS delta cards on the driver dashboard.
    /// Default 2 Hz. The picker writes to UserDefaults; DriverCardView reads
    /// the same key with @AppStorage so the change applies live.
    @AppStorage(Constants.Keys.gpsDeltaRefreshHz) private var deltaRefreshHz: Int = 2

    var body: some View {
        Form {
            Section(t("gps.source")) {
                // App is RaceBox-only. Hide the "Telefono" option from the
                // picker — only "Ninguno" and "RaceBox BLE" are selectable.
                Picker(t("gps.source"), selection: $gpsVM.source) {
                    ForEach(GPSSource.selectable, id: \.self) { src in
                        Text(src.displayName).tag(src)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: gpsVM.source) {
                    gpsVM.selectSource(gpsVM.source)
                }
            }

            if gpsVM.source == .racebox {
                Section(t("gps.raceboxBle")) {
                    // Connected device — show disconnect button
                    if let device = gpsVM.bleManager.connectedDevice {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text(device.name ?? t("gps.raceboxName"))
                            Spacer()
                            Button(t("gps.disconnect")) {
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
                                Text(t("common.searching"))
                                    .foregroundColor(.gray)
                            }
                        }

                        if gpsVM.bleManager.discoveredDevices.isEmpty && !gpsVM.bleManager.isScanning {
                            VStack(spacing: 6) {
                                Text(t("gps.noDevices"))
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                                Text(t("gps.noDevicesHint"))
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
                                    Text(device.name ?? t("gps.raceboxName"))
                                    Spacer()
                                    if connectingDeviceId == device.identifier {
                                        ProgressView()
                                    }
                                }
                                .frame(minHeight: 44)
                            }
                            .disabled(connectingDeviceId != nil)
                            .accessibilityLabel(device.name ?? t("gps.raceboxName"))
                        }

                        if !gpsVM.bleManager.isScanning {
                            Button(t("gps.searchDevices")) {
                                gpsVM.bleManager.startScan()
                            }
                            .frame(minHeight: 44)
                        }
                    }
                }
            }

            // The phone GPS source is no longer selectable — the entire
            // "GPS del telefono" section is intentionally removed.

            // Delta refresh rate. Lives next to the RaceBox section because
            // the GPS delta cards only render meaningful values when a
            // RaceBox is feeding samples. Underlying `deltaBestMs` is
            // updated at the device sample rate (~50Hz) regardless — this
            // only controls how often the visible number changes on screen.
            if gpsVM.source == .racebox {
                Section {
                    Picker(t("gps.deltaFrequency"), selection: $deltaRefreshHz) {
                        Text("1 Hz").tag(1)
                        Text("2 Hz").tag(2)
                        Text("4 Hz").tag(4)
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text(t("gps.displaySection"))
                } footer: {
                    Text(t("gps.deltaHint"))
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }

            if gpsVM.source != .none {
                Section(t("gps.status")) {
                    HStack { Text(t("gps.connected")); Spacer()
                        Image(systemName: gpsVM.isConnected ? "checkmark.circle.fill" : "xmark.circle")
                            .foregroundColor(gpsVM.isConnected ? .green : .red)
                    }
                    HStack { Text(t("gps.signal")); Spacer(); Text(gpsVM.signalQuality.displayName).foregroundColor(.gray) }
                    HStack {
                        Text(t("gps.satellites"))
                        Spacer()
                        Text("\(gpsVM.lastSample?.numSatellites ?? 0)")
                            .foregroundColor(.gray)
                            .monospacedDigit()
                    }
                    HStack { Text(t("gps.frequency")); Spacer(); Text("\(Int(gpsVM.sampleRate)) Hz").foregroundColor(.gray) }
                }
            }

            // IMU Calibration — only for RaceBox (phone GPS doesn't have an external IMU)
            if gpsVM.source == .racebox {
                Section(t("gps.imuTitle")) {
                    HStack {
                        Text(t("gps.phase"))
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
                            Text(t("gps.samples", ["pct": String(Int(gpsVM.calibrator.progress * 100))]))
                                .font(.caption)
                                .foregroundColor(.gray)
                            ProgressView(value: gpsVM.calibrator.progress)
                                .tint(.blue)
                        }
                    }

                    if gpsVM.calibrator.phase == .ready {
                        Text(t("gps.driveHint"))
                            .font(.caption)
                            .foregroundColor(.cyan)
                    }

                    if gpsVM.calibrator.phase == .aligned {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text(t("gps.calibrationComplete"))
                                .foregroundColor(.green)
                        }
                        .font(.subheadline)
                    }

                    // Action buttons
                    if gpsVM.calibrator.phase == .idle {
                        Button(t("gps.startCalibration")) {
                            gpsVM.calibrator.startCalibration()
                            toast.info("Manten el kart quieto durante la calibracion")
                        }
                        .frame(minHeight: 44)
                        .disabled(gpsVM.bleManager.connectedDevice == nil)

                        if gpsVM.bleManager.connectedDevice == nil {
                            Text(t("gps.connectFirst"))
                                .font(.caption)
                                .foregroundColor(Color(.systemGray3))
                        }
                    } else if gpsVM.calibrator.phase == .sampling {
                        Text(t("gps.holdStill"))
                            .font(.caption)
                            .foregroundColor(.blue)
                    } else if gpsVM.calibrator.phase == .ready {
                        Button(t("gps.skipAlign")) {
                            gpsVM.calibrator.skipAlignment()
                            toast.success("Calibracion completada (sin alineacion)")
                        }
                        .frame(minHeight: 44)
                    } else if gpsVM.calibrator.phase == .aligned {
                        Button(t("gps.recalibrate")) {
                            gpsVM.calibrator.reset()
                            gpsVM.calibrator.startCalibration()
                            toast.info("Recalibrando — manten el kart quieto")
                        }
                        .frame(minHeight: 44)
                    }

                    Button(t("gps.resetCalibration"), role: .destructive) {
                        gpsVM.calibrator.reset()
                        toast.warning("Calibracion reseteada")
                    }
                    .frame(minHeight: 44)
                    .disabled(gpsVM.calibrator.phase == .idle)
                }
            }
        }
        .navigationTitle(t("gps.title"))
    }

    private var calibPhaseText: String {
        switch gpsVM.calibrator.phase {
        case .idle: return t("gps.phaseIdle")
        case .sampling: return t("gps.phaseSampling")
        case .ready: return t("gps.phaseReady")
        case .aligned: return t("gps.phaseAligned")
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
