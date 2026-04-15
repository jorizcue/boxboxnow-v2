import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class RaceStoreWebSocketIntegrationTests: XCTestCase {

    func testFullPipelineSnapshotThenUpdate() async throws {
        let mock = MockRaceWebSocketClient()
        let store = RaceStore(wsClient: mock)

        // MockRaceWebSocketClient is an actor — connect / inject are
        // actor-isolated, so they must be awaited from outside.
        await mock.connect(url: URL(string: "ws://x")!, token: "t")

        let snapMsg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        await mock.inject(snapMsg)

        try await waitUntil(timeout: 1.0) { store.karts.count == 2 && store.isConnected }

        let update = WsMessage(
            type: .update,
            data: nil,
            events: [makeEvent(rowId: "k-1", kartNumber: 1, lastLapMs: 87000, totalLaps: 51)]
        )
        await mock.inject(update)
        try await waitUntil(timeout: 1.0) { store.karts[0].base.totalLaps == 51 }
        XCTAssertEqual(store.karts[0].base.lastLapMs, 87000)
    }

    // MARK: - Helpers

    private func waitUntil(timeout: TimeInterval, check: @MainActor () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await MainActor.run(body: check) { return }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("timeout waiting for condition")
    }

    private func makeEvent(rowId: String, kartNumber: Int, lastLapMs: Double, totalLaps: Int) -> WsUpdateEvent {
        let json: [String: JSONValue] = [
            "event": .string("lap_completed"),
            "rowId": .string(rowId),
            "kartNumber": .int(kartNumber),
            "lastLapMs": .double(lastLapMs),
            "totalLaps": .int(totalLaps)
        ]
        let data = try! JSONEncoder().encode(json)
        return try! JSONDecoder().decode(WsUpdateEvent.self, from: data)
    }
}
