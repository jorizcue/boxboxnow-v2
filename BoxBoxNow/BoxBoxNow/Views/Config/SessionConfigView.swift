import SwiftUI

struct SessionConfigView: View {
    @EnvironmentObject var configVM: ConfigViewModel
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
                        NumberCard(title: "NUESTRO KART", value: $configVM.session.ourKartNumber, accent: true)
                        NumberCard(title: "DURACION (MIN)", value: $configVM.session.durationMin)
                        NumberCard(title: "PITS MINIMOS", value: $configVM.session.minPits)
                        NumberCard(title: "TIEMPO PIT (S)", value: $configVM.session.pitTimeS)
                        NumberCard(title: "STINT MIN (MIN)", value: $configVM.session.minStintMin)
                        NumberCard(title: "STINT MAX (MIN)", value: $configVM.session.maxStintMin)
                        NumberCard(title: "TIEMPO MIN\nPILOTO (MIN)", value: $configVM.session.minDriverTimeMin)
                        NumberCard(title: "PIT CERRADO\nINICIO (MIN)", value: $configVM.session.pitClosedStartMin)
                        NumberCard(title: "PIT CERRADO\nFINAL (MIN)", value: $configVM.session.pitClosedEndMin)
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
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(showSaved ? Color.green : Color.accentColor)
                        .foregroundColor(.black)
                        .cornerRadius(12)
                    }
                    .disabled(isSaving)
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
        }
    }

    private func saveSession() {
        isSaving = true
        Task {
            await configVM.saveSession()
            await MainActor.run {
                isSaving = false
                showSaved = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    showSaved = false
                }
            }
        }
    }
}

struct NumberCard: View {
    let title: String
    @Binding var value: Int
    var accent: Bool = false
    @State private var text: String = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            TextField("", text: $text)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(accent ? .accentColor : .white)
                .multilineTextAlignment(.center)
                .keyboardType(.numberPad)
                .focused($isFocused)
                .onChange(of: text) {
                    if let n = Int(text) { value = n }
                }
                .onSubmit { isFocused = false }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .stroke(accent ? Color.accentColor.opacity(0.5) : Color(.systemGray4), lineWidth: 1.5)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(.systemGray6)))
        )
        .onAppear { text = "\(value)" }
        .onChange(of: value) { text = "\(value)" }
    }
}
