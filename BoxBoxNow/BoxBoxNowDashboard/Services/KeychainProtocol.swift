import Foundation

protocol KeychainProtocol {
    func saveToken(_ token: String)
    func loadToken() -> String?
    func deleteToken()
}

struct RealKeychain: KeychainProtocol {
    func saveToken(_ token: String) { KeychainHelper.saveToken(token) }
    func loadToken() -> String? { KeychainHelper.loadToken() }
    func deleteToken() { KeychainHelper.deleteToken() }
}
