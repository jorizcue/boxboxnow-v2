import Foundation
@testable import BoxBoxNowDashboard

final class MockKeychainHelper: KeychainProtocol {
    var savedToken: String?
    func saveToken(_ token: String) { savedToken = token }
    func loadToken() -> String? { savedToken }
    func deleteToken() { savedToken = nil }
}
