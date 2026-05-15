import SwiftUI

struct GPSConfigView: View {
    @EnvironmentObject var gpsVM: GPSViewModel
    @EnvironmentObject var lang: LanguageStore

    var body: some View {
        Form {
            Section(t("gps.source", lang.current)) {
                Picker(t("gps.sourceLabel", lang.current), selection: $gpsVM.source) {
                    ForEach(GPSSource.allCases, id: \.self) { src in
                        Text(t(src.i18nKey, lang.current)).tag(src)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: gpsVM.source) { newVal in
                    gpsVM.selectSource(newVal)
                }
            }

            if gpsVM.source == .racebox {
                Section(t("gps.raceboxBle", lang.current)) {
                    if gpsVM.bleManager.isScanning {
                        HStack {
                            ProgressView()
                            Text(t("gps.searching", lang.current))
                                .foregroundColor(.gray)
                        }
                    }

                    ForEach(gpsVM.bleManager.discoveredDevices, id: \.identifier) { device in
                        Button(action: { gpsVM.bleManager.connect(device) }) {
                            HStack {
                                Text(device.name ?? t("common.unknown", lang.current))
                                Spacer()
                                if gpsVM.bleManager.connectedDevice?.identifier == device.identifier {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                    }

                    if !gpsVM.bleManager.isScanning && gpsVM.bleManager.connectedDevice == nil {
                        Button(t("gps.searchDevices", lang.current)) {
                            gpsVM.bleManager.startScan()
                        }
                    }
                }
            }

            if gpsVM.source == .phone {
                Section(t("gps.phone", lang.current)) {
                    HStack {
                        Text(t("gps.status", lang.current))
                        Spacer()
                        Text(gpsVM.phoneGPS.authorizationStatus == .authorizedWhenInUse
                             ? t("gps.authorized", lang.current)
                             : t("common.pending", lang.current))
                            .foregroundColor(.gray)
                    }
                }
            }

            if gpsVM.source != .none {
                Section(t("gps.status", lang.current)) {
                    HStack { Text(t("gps.connected", lang.current)); Spacer()
                        Image(systemName: gpsVM.isConnected ? "checkmark.circle.fill" : "xmark.circle")
                            .foregroundColor(gpsVM.isConnected ? .green : .red)
                    }
                    HStack { Text(t("gps.signal", lang.current)); Spacer()
                        Text(t(gpsVM.signalQuality.i18nKey, lang.current)).foregroundColor(.gray) }
                    HStack { Text(t("gps.frequency", lang.current)); Spacer()
                        Text("\(Int(gpsVM.sampleRate)) Hz").foregroundColor(.gray) }
                }

                Section(t("gps.imuCalibration", lang.current)) {
                    HStack { Text(t("gps.phase", lang.current)); Spacer()
                        Text(calibPhaseText).foregroundColor(.gray)
                    }
                    Button(t("gps.startCalibration", lang.current)) {
                        // Access calibrator through gpsVM
                    }
                }
            }
        }
        .navigationTitle(t("gps.title", lang.current))
    }

    private var calibPhaseText: String {
        t("common.pending", lang.current)
    }
}
