import SwiftUI

struct SessionConfigView: View {
    @EnvironmentObject var configVM: ConfigViewModel
    @EnvironmentObject var lang: LanguageStore
    @State private var circuitText = ""

    var body: some View {
        Form {
            Section(t("session.circuit", lang.current)) {
                TextField(t("session.circuitId", lang.current), text: $circuitText)
                    .keyboardType(.numberPad)
                    .onChange(of: circuitText) { val in
                        configVM.circuitId = Int(val)
                    }
            }

            Section(t("config.session", lang.current)) {
                TextField(t("session.name", lang.current), text: $configVM.sessionName)
            }

            Section(t("session.duration", lang.current)) {
                HStack {
                    Text(t("session.totalLaps", lang.current))
                    Spacer()
                    TextField("--", value: $configVM.totalLaps, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }
                HStack {
                    Text(t("session.totalMinutes", lang.current))
                    Spacer()
                    TextField("--", value: $configVM.totalMinutes, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }
            }

            Section(t("session.kartCount", lang.current)) {
                Stepper(
                    t("session.kartCountValue", lang.current, params: ["count": String(configVM.kartCount)]),
                    value: $configVM.kartCount,
                    in: 1...60,
                )
            }
        }
        .navigationTitle(t("config.session", lang.current))
        .onAppear {
            circuitText = configVM.circuitId.map(String.init) ?? ""
        }
        .onDisappear { configVM.save() }
    }
}
