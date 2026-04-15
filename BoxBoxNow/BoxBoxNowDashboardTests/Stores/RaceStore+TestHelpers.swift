import Foundation
@testable import BoxBoxNowDashboard

@MainActor
extension RaceStore {
    static func makeForTests(boxCallTimeout: TimeInterval = 10) -> RaceStore {
        RaceStore(wsClient: MockRaceWebSocketClient(), boxCallTimeout: boxCallTimeout)
    }
}
