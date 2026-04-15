import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class RaceStoreWebSocketIntegrationTests: XCTestCase {

    private var mock: MockRaceWebSocketClient!
    private var store: RaceStore!

    override func setUp() async throws {
        try await super.setUp()
        mock = MockRaceWebSocketClient()
        store = RaceStore(wsClient: mock)
    }

    override func tearDown() async throws {
        // Finish the mock's AsyncStreams so the observation Tasks inside
        // RaceStore exit their `for await` loops instead of suspending forever.
        // Without this, every test run leaks a Task + mock + store.
        await mock.finish()
        mock = nil
        store = nil
        try await super.tearDown()
    }

    func testFullPipelineSnapshotThenUpdate() async throws {
        // MockRaceWebSocketClient is an actor — connect / inject are
        // actor-isolated, so they must be awaited from outside.
        await mock.connect(url: URL(string: "ws://x")!, token: "t")

        let snapMsg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        await mock.inject(snapMsg)

        try await AsyncTestHelpers.waitUntil(timeout: 1.0) {
            self.store.karts.count == 2 && self.store.isConnected
        }

        let update = WsMessage(
            type: .update,
            data: nil,
            events: [makeEvent(rowId: "k-1", kartNumber: 1, lastLapMs: 87000, totalLaps: 51)]
        )
        await mock.inject(update)
        try await AsyncTestHelpers.waitUntil(timeout: 1.0) {
            self.store.karts[0].base.totalLaps == 51
        }
        XCTAssertEqual(store.karts[0].base.lastLapMs, 87000)
    }

    // MARK: - Helpers

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
