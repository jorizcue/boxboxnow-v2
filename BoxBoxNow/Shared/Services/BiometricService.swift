import LocalAuthentication

enum BiometricService {

    // MARK: - Device capabilities

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
        case .faceID:  return "Face ID"
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
        case .faceID:          return "faceid"
        case .touchID:         return "touchid"
        case .opticID:         return "opticid"
        case .none:            return "lock.shield"
        @unknown default:      return "lock.shield"
        }
    }

    // MARK: - Per-user opt-in flag
    //
    // Using a per-username key prevents one user's biometric setting from
    // bleeding into another user's session when multiple accounts share
    // the same device.

    private static func enabledKey(for username: String) -> String {
        "com.boxboxnow.biometric.\(username)"
    }

    static func isEnabled(for username: String) -> Bool {
        UserDefaults.standard.bool(forKey: enabledKey(for: username))
    }

    static func setEnabled(_ enabled: Bool, for username: String) {
        UserDefaults.standard.set(enabled, forKey: enabledKey(for: username))
    }

    // MARK: - Convenience using last-known username

    /// Whether biometric is enabled for whoever logged in last.
    static var isEnabled: Bool {
        get {
            guard let u = KeychainHelper.loadLastUsername() else { return false }
            return isEnabled(for: u)
        }
        set {
            guard let u = KeychainHelper.loadLastUsername() else { return }
            setEnabled(newValue, for: u)
        }
    }

    // MARK: - Authentication

    /// Authenticate with Face ID / Touch ID. Returns true on success.
    static func authenticate() async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Usar contraseña"

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

    /// Disable biometric and clear the preference for the last-known user.
    static func disable() {
        isEnabled = false
    }

    /// Disable biometric for a specific user.
    static func disable(for username: String) {
        setEnabled(false, for: username)
    }
}
