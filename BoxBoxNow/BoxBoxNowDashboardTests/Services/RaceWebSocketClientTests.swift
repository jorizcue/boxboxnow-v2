import XCTest
@testable import BoxBoxNowDashboard

final class RaceWebSocketClientTests: XCTestCase {
    func testActorIsolatesState() async throws {
        let client = RaceWebSocketClient()
        await client.disconnect()

        // Disconnecting when never connected should yield a `.normal` state and not crash.
        var receivedState: RaceConnectionState?
        for await state in client.connectionStates {
            receivedState = state
            break
        }
        if case .disconnected(reason: .normal) = receivedState! {} else {
            XCTFail("expected .disconnected(.normal), got \(String(describing: receivedState))")
        }
    }
}
