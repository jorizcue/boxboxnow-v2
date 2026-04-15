import XCTest
@testable import BoxBoxNowDashboard

final class RaceWebSocketClientTests: XCTestCase {
    func testActorIsolatesState() async throws {
        let client = RaceWebSocketClient()
        await client.disconnect()

        // Disconnecting when never connected should yield a `.normal` state without crashing.
        // Pins the buffer assumption: disconnect's yield is buffered (default .unbounded) so the
        // iterator-based read below can collect it even though the yield happened before iteration.
        var iterator = client.connectionStates.makeAsyncIterator()
        let state = await iterator.next()
        guard case .disconnected(reason: .normal) = state else {
            XCTFail("expected .disconnected(.normal), got \(String(describing: state))")
            return
        }
    }
}
