import SwiftUI

struct SessionConfigView: View {
    @EnvironmentObject var configVM: ConfigViewModel
    @State private var circuitText = ""

    var body: some View {
        Form {
            Section("Circuito") {
                TextField("ID del circuito", text: $circuitText)
                    .keyboardType(.numberPad)
                    .onChange(of: circuitText) { val in
                        configVM.circuitId = Int(val)
                    }
            }

            Section("Sesion") {
                TextField("Nombre de sesion", text: $configVM.sessionName)
            }

            Section("Duracion") {
                HStack {
                    Text("Vueltas totales")
                    Spacer()
                    TextField("--", value: $configVM.totalLaps, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }
                HStack {
                    Text("Minutos totales")
                    Spacer()
                    TextField("--", value: $configVM.totalMinutes, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }
            }

            Section("Karts") {
                Stepper("Karts: \(configVM.kartCount)", value: $configVM.kartCount, in: 1...60)
            }
        }
        .navigationTitle("Sesion")
        .onAppear {
            circuitText = configVM.circuitId.map(String.init) ?? ""
        }
        .onDisappear { configVM.save() }
    }
}
