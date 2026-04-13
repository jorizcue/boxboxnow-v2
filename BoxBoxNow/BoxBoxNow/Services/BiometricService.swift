import LocalAuthentication

enum BiometricService {
    private static let enabledKey = "com.boxboxnow.biometric.enabled"

    /// Whether the device supports Face ID or Touch ID
    static var isAvailable: Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    /// Human-readable name: "Face ID" or "Touch ID"
    static var biometricName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        @unknown default: return "Biometria"
        }
    }

    /// SF Symbol for the current biometric type
    static var iconName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        default: return "lock.shield"
        }
    }

    /// Whether user has opted in to biometric login
    static var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    /// Authenticate with Face ID / Touch ID. Returns true on success.
    static func authenticate() async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Usar contrasena"

        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Inicia sesion en BoxBoxNow"
            )
        } catch {
            print("[Biometric] Auth failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Disable biometric and clear the preference
    static func disable() {
        isEnabled = false
    }
}
