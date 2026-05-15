import SwiftUI

struct DriverMenuOverlay: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var langStore: LanguageStore
    @ObservedObject var speech: DriverSpeechService
    @Binding var isPresented: Bool
    var onDismiss: () -> Void

    var body: some View {
        HStack {
            // Tap outside to close
            Color.black.opacity(0.3)
                .ignoresSafeArea()
                .onTapGesture { isPresented = false }

            VStack(spacing: 0) {
                // Header: title + close button (iOS standard X)
                HStack {
                    Text(t("driver.menuTitle"))
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
                    .accessibilityLabel(t("common.close"))
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
                            Text(t("driver.menuTemplate"))
                                .font(.caption)
                                .foregroundColor(.gray)

                            if !driverVM.presets.isEmpty {
                                Picker(t("driver.menuTemplate"), selection: $driverVM.selectedPresetId) {
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
                                Text(t("driver.menuContrast"))
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                Spacer()
                                Text(driverVM.brightness == 0 ? t("driver.menuNormal") : "+\(Int(driverVM.brightness * 100))%")
                                    .font(.caption.monospacedDigit())
                                    .foregroundColor(.white)
                            }
                            Slider(value: $driverVM.brightness, in: 0...1.0, step: 0.05)
                                .accentColor(.accentColor)
                                .accessibilityLabel(t("driver.menuContrast"))
                                .accessibilityValue(driverVM.brightness == 0 ? t("driver.menuNormal") : "+\(Int(driverVM.brightness * 100))%")
                        }

                        // Orientation
                        VStack(alignment: .leading, spacing: 8) {
                            Text(t("driver.menuOrientation"))
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
                                Text(driverVM.audioEnabled ? t("driver.narrationOn") : t("driver.narrationOff"))
                                    .font(.subheadline)
                                    .foregroundColor(.white)
                            }
                        }
                        .tint(.accentColor)
                        .onChange(of: driverVM.audioEnabled) { _, _ in
                            // Persist immediately so the choice survives restarts.
                            driverVM.saveConfig()
                        }

                        // Exit button
                        Button(action: {
                            driverVM.saveConfig()
                            isPresented = false
                            onDismiss()
                        }) {
                            HStack {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                Text(t("driver.menuExit"))
                            }
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Color.red.opacity(0.15))
                            .foregroundColor(.red)
                            .cornerRadius(10)
                        }
                        .accessibilityLabel(t("driver.menuExit"))
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

}
