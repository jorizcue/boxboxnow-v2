import SwiftUI

struct DriverMenuOverlay: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var gpsVM: GPSViewModel
    @EnvironmentObject var configVM: ConfigViewModel
    @ObservedObject var speech: DriverSpeechService
    @Binding var isPresented: Bool
    var onDismiss: () -> Void

    /// The active circuit, resolved from configVM. Used in the debug panel
    /// to compare server-side finish line coordinates with what the
    /// LapTracker actually has loaded.
    private var activeCircuit: Circuit? {
        guard let cid = configVM.session.circuitId else { return nil }
        return configVM.circuits.first(where: { $0.id == cid })
    }

    var body: some View {
        HStack {
            // Tap outside to close
            Color.black.opacity(0.3)
                .ignoresSafeArea()
                .onTapGesture { isPresented = false }

            VStack(spacing: 0) {
                // Header: title + close button (iOS standard X)
                HStack {
                    Text("Menu")
                        .font(.title3.bold())
                        .foregroundColor(.white)
                    Spacer()
                    Button {
                        isPresented = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .symbolRenderingMode(.hierarchical)
                            .foregroundColor(.gray)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Cerrar menu")
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 12)

                Divider().background(Color(.systemGray4))

                // Scrollable content for landscape
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        // Preset selector
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Plantilla")
                                .font(.caption)
                                .foregroundColor(.gray)

                            if !driverVM.presets.isEmpty {
                                Picker("Plantilla", selection: $driverVM.selectedPresetId) {
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
                                .accessibilityLabel("Contraste")
                                .accessibilityValue(driverVM.brightness == 0 ? "Normal" : "+\(Int(driverVM.brightness * 100))%")
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
                        // Binds to driverVM.audioEnabled (the single source of
                        // truth) instead of speech.enabled. DriverView observes
                        // driverVM.audioEnabled and propagates changes to the
                        // speech service, so the toggle still controls playback
                        // while also persisting the choice and surviving preset
                        // reloads.
                        Toggle(isOn: $driverVM.audioEnabled) {
                            HStack(spacing: 8) {
                                Image(systemName: driverVM.audioEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                                    .foregroundColor(driverVM.audioEnabled ? .accentColor : .gray)
                                Text("Audio")
                                    .font(.subheadline)
                                    .foregroundColor(.white)
                            }
                        }
                        .tint(.accentColor)
                        .onChange(of: driverVM.audioEnabled) { _, _ in
                            // Persist immediately so the choice survives restarts.
                            driverVM.saveConfig()
                        }

                        // GPS / LapTracker debug panel — shows live state so the
                        // user can diagnose why the delta isn't computing.
                        // TimelineView refreshes every 0.5s since lapTracker
                        // isn't bound via @ObservedObject.
                        TimelineView(.periodic(from: .now, by: 0.5)) { _ in
                            VStack(alignment: .leading, spacing: 6) {
                                Text("GPS / Vueltas (debug)")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                VStack(alignment: .leading, spacing: 4) {
                                    debugRow("Fuente",       gpsVM.source.displayName)
                                    debugRow("Conectado",    gpsVM.isConnected ? "Si" : "No")
                                    debugRow("Fix type",     "\(gpsVM.lastSample?.fixType ?? -1)")
                                    debugRow("Satelites",    "\(gpsVM.lastSample?.numSatellites ?? 0)")
                                    debugRow("Linea meta",   driverVM.lapTracker.hasFinishLine ? "Si" : "No")
                                    debugRow("Vueltas",      "\(driverVM.lapTracker.currentLap)")
                                    debugRow("Mejor (GPS)",  driverVM.lapTracker.bestLapMs.map { Formatters.msToLapTime($0) } ?? "-")
                                    debugRow("Dist actual",  String(format: "%.0fm", driverVM.lapTracker.currentLapDistanceM))
                                    debugRow("Dist mejor",   driverVM.lapTracker.bestLapDistanceM.map { String(format: "%.0fm", $0) } ?? "-")
                                    debugRow("Delta best",   driverVM.lapTracker.deltaBestMs.map { String(format: "%+.2fs", $0/1000) } ?? "-")
                                }
                                .padding(8)
                                .background(Color.black.opacity(0.4))
                                .cornerRadius(6)

                                // Coordinates: server-side circuit config vs
                                // what the LapTracker actually loaded. If they
                                // don't match, applyCircuitFinishLine() didn't
                                // run or the circuit list is stale.
                                Text("Coordenadas meta")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                    .padding(.top, 4)
                                VStack(alignment: .leading, spacing: 4) {
                                    debugRow("Circuito", activeCircuit?.name ?? "—")
                                    debugRow("Servidor P1", coord(activeCircuit?.finishLat1, activeCircuit?.finishLon1))
                                    debugRow("Servidor P2", coord(activeCircuit?.finishLat2, activeCircuit?.finishLon2))
                                    debugRow("LapTracker P1", coord(driverVM.lapTracker.currentFinishLine?.p1.lat,
                                                                    driverVM.lapTracker.currentFinishLine?.p1.lon))
                                    debugRow("LapTracker P2", coord(driverVM.lapTracker.currentFinishLine?.p2.lat,
                                                                    driverVM.lapTracker.currentFinishLine?.p2.lon))
                                    debugRow("Pos actual", coord(gpsVM.lastSample?.lat, gpsVM.lastSample?.lon))
                                }
                                .padding(8)
                                .background(Color.black.opacity(0.4))
                                .cornerRadius(6)
                            }
                        }

                        // Exit button
                        Button(action: {
                            driverVM.saveConfig()
                            isPresented = false
                            onDismiss()
                        }) {
                            HStack {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                Text("Salir")
                            }
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Color.red.opacity(0.15))
                            .foregroundColor(.red)
                            .cornerRadius(10)
                        }
                        .accessibilityLabel("Salir de la vista del piloto")
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
            .frame(width: 280)
            .background(Color(.systemGray6).opacity(0.97))
        }
        .transition(.move(edge: .trailing))
        .animation(.easeInOut(duration: 0.25), value: isPresented)
    }

    @ViewBuilder
    private func debugRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption2)
                .foregroundColor(.gray)
            Spacer()
            Text(value)
                .font(.caption2.monospacedDigit())
                .foregroundColor(.white)
        }
    }

    private func coord(_ lat: Double?, _ lon: Double?) -> String {
        guard let lat, let lon else { return "—" }
        return String(format: "%.6f, %.6f", lat, lon)
    }
}
