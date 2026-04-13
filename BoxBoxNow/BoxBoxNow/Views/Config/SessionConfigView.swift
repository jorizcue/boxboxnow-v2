import SwiftUI

struct SessionConfigView: View {
    @EnvironmentObject var configVM: ConfigViewModel
    @EnvironmentObject var toast: ToastManager
    @State private var isSaving = false
    @State private var showSaved = false

    var body: some View {
        ScrollView {
            if configVM.isLoading {
                ProgressView("Cargando sesion...")
                    .padding(.top, 60)
            } else {
                VStack(spacing: 12) {
                    // Circuit
                    if !configVM.circuits.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("CIRCUITO").font(.caption).foregroundColor(.gray)
                            Picker("Circuito", selection: $configVM.session.circuitId) {
                                Text("Seleccionar").tag(nil as Int?)
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

                    // Cards grid - 3 columns
                    let columns = [GridItem(.flexible(), spacing: 10),
                                   GridItem(.flexible(), spacing: 10),
                                   GridItem(.flexible(), spacing: 10)]

                    LazyVGrid(columns: columns, spacing: 10) {
                        NumberCard(title: "NUESTRO KART", value: $configVM.session.ourKartNumber, accent: true, range: 1...999)
                        NumberCard(title: "DURACION (MIN)", value: $configVM.session.durationMin, range: 1...1440)
                        NumberCard(title: "PITS MINIMOS", value: $configVM.session.minPits, range: 0...50)
                        NumberCard(title: "TIEMPO PIT (S)", value: $configVM.session.pitTimeS, range: 0...600)
                        NumberCard(title: "STINT MIN (MIN)", value: $configVM.session.minStintMin, range: 0...300)
                        NumberCard(title: "STINT MAX (MIN)", value: $configVM.session.maxStintMin, range: 0...300)
                        NumberCard(title: "TIEMPO MIN\nPILOTO (MIN)", value: $configVM.session.minDriverTimeMin, range: 0...300)
                        NumberCard(title: "PIT CERRADO\nINICIO (MIN)", value: $configVM.session.pitClosedStartMin, range: 0...1440)
                        NumberCard(title: "PIT CERRADO\nFINAL (MIN)", value: $configVM.session.pitClosedEndMin, range: 0...1440)
                    }

                    // Save button
                    Button(action: saveSession) {
                        HStack {
                            if isSaving {
                                ProgressView().tint(.black)
                            }
                            Text(showSaved ? "GUARDADO ✓" : "ACTUALIZAR SESION")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.horizontal)
                        .background(showSaved ? Color.green : Color.accentColor)
                        .foregroundColor(.black)
                        .cornerRadius(12)
                    }
                    .disabled(isSaving)
                    .accessibilityLabel(showSaved ? "Guardado" : "Actualizar sesión")
                    .padding(.top, 8)
                }
                .padding(16)
            }
        }
        .background(Color.black)
        .navigationTitle("Sesion de carrera")
        .task {
            await configVM.loadSession()
            await configVM.loadCircuits()
            if let error = configVM.errorMessage {
                toast.error("Error cargando sesion: \(error)")
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

struct NumberCard: View {
    let title: String
    @Binding var value: Int
    var accent: Bool = false
    var range: ClosedRange<Int> = 0...9999
    @State private var text: String = ""
    @State private var isInvalid = false
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            TextField("0", text: $text)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(isInvalid ? .red : (accent ? .accentColor : .white))
                .multilineTextAlignment(.center)
                .keyboardType(.numberPad)
                .focused($isFocused)
                .onChange(of: text) {
                    // Strip non-numeric characters
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
                        // Clamp on blur
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
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("OK") { isFocused = false }
                    }
                }
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
    }
}
