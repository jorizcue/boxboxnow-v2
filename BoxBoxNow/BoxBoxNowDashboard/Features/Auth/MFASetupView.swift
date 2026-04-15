import SwiftUI
import CoreImage.CIFilterBuiltins

struct MFASetupView: View {
    let otpAuthURL: String
    @Environment(AppStore.self) private var app
    @State private var code = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Configura la verificación en dos pasos")
                .font(BBNTypography.title1)
                .foregroundColor(BBNColors.textPrimary)

            if let qr = generateQR(from: otpAuthURL) {
                Image(uiImage: qr)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 220, height: 220)
                    .padding(12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Text("Escanea con Google Authenticator o similar, luego introduce el código")
                .font(BBNTypography.body)
                .foregroundColor(BBNColors.textMuted)
                .multilineTextAlignment(.center)

            BBNCard {
                VStack(spacing: 12) {
                    TextField("000000", text: $code)
                        .keyboardType(.numberPad)
                        .font(BBNTypography.title2)
                        .monospacedDigit()
                        .multilineTextAlignment(.center)
                        .onChange(of: code) { _, new in
                            code = String(new.prefix(6).filter(\.isNumber))
                        }
                    BBNPrimaryButton(title: "Verificar") {
                        Task { await app.auth.verifyMFA(code: code) }
                    }
                    .disabled(code.count != 6)
                    if let err = errorMessage {
                        Text(err)
                            .font(BBNTypography.caption)
                            .foregroundColor(BBNColors.danger)
                    }
                }
                .padding(8)
            }
            .frame(maxWidth: 400)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background.ignoresSafeArea())
        .onChange(of: app.auth.authState) { _, new in
            if case .loginFailed(let m) = new {
                errorMessage = m
            } else {
                errorMessage = nil
            }
        }
    }

    private func generateQR(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let context = CIContext()
        guard let cgImg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImg)
    }
}
