import Foundation
import Security

enum KeychainHelper {

    // MARK: - Per-user token storage
    //
    // Each username gets its own Keychain entry so switching between accounts
    // on the same device never crosses tokens. The last logged-in username is
    // persisted in UserDefaults (non-sensitive — it is only a lookup key, not
    // a credential) so the correct entry can be loaded on cold start before
    // any authentication has happened.

    private static let lastUsernameKey = "com.boxboxnow.lastUsername"

    static func saveLastUsername(_ username: String) {
        UserDefaults.standard.set(username, forKey: lastUsernameKey)
    }

    static func loadLastUsername() -> String? {
        UserDefaults.standard.string(forKey: lastUsernameKey)
    }

    // MARK: - Token

    private static func keychainKey(for username: String) -> String {
        "com.boxboxnow.jwt.\(username)"
    }

    static func saveToken(_ token: String, forUser username: String) {
        saveLastUsername(username)
        guard let data = token.data(using: .utf8) else { return }
        let key = keychainKey(for: username)
        delete(key: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func loadToken(forUser username: String) -> String? {
        let key = keychainKey(for: username)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Loads the token for whoever logged in last.
    static func loadToken() -> String? {
        guard let username = loadLastUsername() else { return nil }
        return loadToken(forUser: username)
    }

    static func deleteToken(forUser username: String) {
        delete(key: keychainKey(for: username))
    }

    /// Deletes the token for whoever logged in last.
    static func deleteToken() {
        guard let username = loadLastUsername() else { return }
        deleteToken(forUser: username)
    }

    private static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - JWT decode helper

    static func decodeJWTPayload(_ token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
