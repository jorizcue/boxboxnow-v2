import SwiftUI

struct SessionConfigView: View {
    @EnvironmentObject var configVM: ConfigViewModel
    @EnvironmentObject var toast: ToastManager
    @EnvironmentObject var langStore: LanguageStore
    @State private var isSaving = false
    @State private var showSaved = false

    private let columns = [GridItem(.flexible(), spacing: 10),
                           GridItem(.flexible(), spacing: 10),
                           GridItem(.flexible(), spacing: 10)]

    var body: some View {
        ScrollView {
            if configVM.isLoading {
                ProgressView(t("common.loading"))
                    .padding(.top, 60)
            } else {
                VStack(spacing: 20) {
                    // ── Circuit picker ──
                    if !configVM.circuits.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(t("session.circuit")).font(.caption).foregroundColor(.gray)
                            Picker(t("session.circuit"), selection: $configVM.session.circuitId) {
                                Text(t("session.selectCircuit")).tag(nil as Int?)
                                ForEach(configVM.circuits) { c in
                                    Text(c.name).tag(c.id as Int?)
                                }
                            }
                            .pickerStyle(.menu)
                            .padding(12)
                            .background(Color(.systemGray6))
                            .cornerRadius(10)
                        }
                    }

                    // ── Section: Carrera ──
                    ConfigSection(title: t("session.sectionRace"), icon: "flag.checkered") {
                        LazyVGrid(columns: columns, spacing: 10) {
                            NumberCard(
                                title: t("session.kartTitle"),
                                value: $configVM.session.ourKartNumber,
                                accent: true, range: 1...999,
                                tooltip: t("session.kartTooltip")
                            )
                            NumberCard(
                                title: t("session.durationTitle"),
                                value: $configVM.session.durationMin,
                                range: 1...1440,
                                tooltip: t("session.durationTooltip")
                            )
                            NumberCard(
                                title: t("session.minPitsTitle"),
                                value: $configVM.session.minPits,
                                range: 0...50,
                                tooltip: t("session.minPitsTooltip")
                            )
                        }
                    }

                    // ── Section: Pit Stops ──
                    ConfigSection(title: t("session.sectionPit"), icon: "wrench.and.screwdriver") {
                        LazyVGrid(columns: columns, spacing: 10) {
                            NumberCard(
                                title: t("session.pitTimeTitle"),
                                value: $configVM.session.pitTimeS,
                                range: 0...600,
                                tooltip: t("session.pitTimeTooltip")
                            )
                            NumberCard(
                                title: t("session.pitClosedStartTitle"),
                                value: $configVM.session.pitClosedStartMin,
                                range: 0...1440,
                                tooltip: t("session.pitClosedStartTooltip")
                            )
                            NumberCard(
                                title: t("session.pitClosedEndTitle"),
                                value: $configVM.session.pitClosedEndMin,
                                range: 0...1440,
                                tooltip: t("session.pitClosedEndTooltip")
                            )
                        }
                    }

                    // ── Section: Stints ──
                    ConfigSection(title: t("session.sectionStints"), icon: "person.2.fill") {
                        LazyVGrid(columns: columns, spacing: 10) {
                            NumberCard(
                                title: t("session.minStintTitle"),
                                value: $configVM.session.minStintMin,
                                range: 0...300,
                                tooltip: t("session.minStintTooltip")
                            )
                            NumberCard(
                                title: t("session.maxStintTitle"),
                                value: $configVM.session.maxStintMin,
                                range: 0...300,
                                tooltip: t("session.maxStintTooltip")
                            )
                            NumberCard(
                                title: t("session.minDriverTimeTitle"),
                                value: $configVM.session.minDriverTimeMin,
                                range: 0...300,
                                tooltip: t("session.minDriverTimeTooltip")
                            )
                            // Pilot count used by the pit-gate feasibility
                            // check (see backend/app/engine/pit_gate.py).
                            // 0 = fallback to Apex-observed drivers.
                            NumberCard(
                                title: t("session.teamDriversTitle"),
                                value: Binding(
                                    get: { configVM.session.teamDriversCount ?? 0 },
                                    set: { configVM.session.teamDriversCount = $0 }
                                ),
                                range: 0...20,
                                tooltip: t("session.teamDriversTooltip")
                            )
                        }
                    }

                    // ── Section: Modo lluvia ──
                    // Quick toggle that mirrors the rain icon on the
                    // web StatusBar: flips `session.rain` and persists
                    // it immediately so the strategist can switch
                    // between dry/wet pace assumptions in one tap,
                    // without scrolling down to "ACTUALIZAR SESION".
                    ConfigSection(title: t("session.sectionRain"), icon: "cloud.rain.fill") {
                        RainToggleRow(
                            rain: configVM.session.rain,
                            onChange: { newVal in
                                configVM.session.rain = newVal
                                Task {
                                    await configVM.saveSession()
                                    if let error = configVM.errorMessage {
                                        await MainActor.run {
                                            // Revert so the toggle
                                            // doesn't lie about the
                                            // server's state.
                                            configVM.session.rain = !newVal
                                            toast.warning("No se pudo actualizar el modo lluvia")
                                            configVM.errorMessage = nil
                                        }
                                    } else {
                                        await MainActor.run {
                                            toast.success(
                                                newVal
                                                    ? "Modo lluvia activado"
                                                    : "Modo lluvia desactivado"
                                            )
                                        }
                                    }
                                }
                            }
                        )
                    }

                    // ── Save button ──
                    Button(action: saveSession) {
                        HStack {
                            if isSaving {
                                ProgressView().tint(.black)
                            }
                            Text(showSaved ? t("session.saved") : t("session.updateSession"))
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.horizontal)
                        .background(showSaved ? Color.green : Color.accentColor)
                        .foregroundColor(.black)
                        .cornerRadius(12)
                    }
                    .disabled(isSaving)
                    .accessibilityLabel(showSaved ? t("session.saved") : t("session.updateSession"))
                    .padding(.top, 4)
                }
                .padding(16)
            }
        }
        .background(Color.black)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(t("common.ok")) {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil, from: nil, for: nil
                    )
                }
            }
        }
        .navigationTitle(t("session.title"))
        .task {
            await configVM.loadSession()
            await configVM.loadCircuits()
            if let error = configVM.errorMessage {
                toast.error("Error cargando sesión: \(error)")
                configVM.errorMessage = nil
            }
        }
    }

    private func saveSession() {
        isSaving = true
        Task {
            await configVM.saveSession()
            await MainActor.run {
                isSaving = false
                if let error = configVM.errorMessage {
                    toast.error("Error al guardar: \(error)")
                    configVM.errorMessage = nil
                } else {
                    showSaved = true
                    toast.success("Sesion guardada")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        showSaved = false
                    }
                }
            }
        }
    }
}

// MARK: - Rain Toggle Row

/// Card-style toggle for race-wide rain mode. Single source of truth
/// for the flag is `configVM.session.rain`, persisted through the
/// same `/config/session` PUT that the web RainToggle hits — both
/// surfaces now stay in sync after a websocket / refresh round-trip.
private struct RainToggleRow: View {
    let rain: Bool
    let onChange: (Bool) -> Void
    @EnvironmentObject var langStore: LanguageStore

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(rain
                        ? Color.blue.opacity(0.18)
                        : Color(.systemGray6))
                    .frame(width: 44, height: 44)
                Image(systemName: rain ? "cloud.rain.fill" : "cloud.rain")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(rain ? Color.blue : .gray)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(rain ? t("session.rainOn") : t("session.rainOff"))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                Text(t("session.rainHint"))
                    .font(.system(size: 11))
                    .foregroundColor(Color(.systemGray))
            }
            Spacer()
            Toggle(
                "",
                isOn: Binding(
                    get: { rain },
                    set: { onChange($0) }
                )
            )
            .labelsHidden()
            .tint(Color.blue)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .stroke(
                    rain ? Color.blue.opacity(0.5) : Color(.systemGray4),
                    lineWidth: 1.5
                )
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(.systemGray6)))
        )
    }
}

// MARK: - Config Section Header

struct ConfigSection<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundColor(.accentColor)
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(.systemGray2))
                    .tracking(1)
            }
            .padding(.leading, 4)

            content
        }
    }
}

// MARK: - Number Card

struct NumberCard: View {
    let title: String
    @Binding var value: Int
    var accent: Bool = false
    var range: ClosedRange<Int> = 0...9999
    var tooltip: String? = nil
    @EnvironmentObject var langStore: LanguageStore
    @State private var text: String = ""
    @State private var isInvalid = false
    @State private var showTooltip = false
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 2) {
                // Reserve space for 2 lines on every card so the grid stays
                // visually uniform — some titles are 1 line ("NUESTRO KART")
                // and others are forced to 2 ("PIT CERRADO\nFINAL (MIN)"),
                // which used to make alternating cards different heights.
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .lineLimit(2, reservesSpace: true)

                if tooltip != nil {
                    Button(action: { showTooltip = true }) {
                        Image(systemName: "info.circle")
                            .font(.system(size: 9))
                            .foregroundColor(Color(.systemGray3))
                    }
                    .buttonStyle(.plain)
                }
            }

            TextField("0", text: $text)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(isInvalid ? .red : (accent ? .accentColor : .white))
                .multilineTextAlignment(.center)
                .keyboardType(.numberPad)
                .focused($isFocused)
                .onChange(of: text) {
                    let filtered = text.filter { $0.isNumber }
                    if filtered != text { text = filtered }
                    if let n = Int(filtered) {
                        isInvalid = !range.contains(n)
                        if range.contains(n) { value = n }
                    } else {
                        isInvalid = !filtered.isEmpty
                    }
                }
                .onChange(of: isFocused) {
                    if !isFocused {
                        if let n = Int(text) {
                            let clamped = min(max(n, range.lowerBound), range.upperBound)
                            value = clamped
                            text = "\(clamped)"
                        } else {
                            text = "\(value)"
                        }
                        isInvalid = false
                    }
                }
                .onSubmit { isFocused = false }
                .accessibilityLabel(title)
                .accessibilityValue("\(value)")
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .stroke(
                    isInvalid ? Color.red.opacity(0.7) :
                    (accent ? Color.accentColor.opacity(0.5) : Color(.systemGray4)),
                    lineWidth: 1.5
                )
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(.systemGray6)))
        )
        .onAppear { text = "\(value)" }
        .onChange(of: value) { text = "\(value)" }
        .alert(title, isPresented: $showTooltip) {
            Button(t("common.ok"), role: .cancel) {}
        } message: {
            Text(tooltip ?? "")
        }
    }
}
