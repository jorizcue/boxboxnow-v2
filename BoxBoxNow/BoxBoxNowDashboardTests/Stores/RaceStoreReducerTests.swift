import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class RaceStoreReducerTests: XCTestCase {

    func testApplySnapshotReplacesAllState() throws {
        let store = RaceStore.makeForTests()
        let msg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        store.apply(message: msg)

        XCTAssertEqual(store.trackName, "Jarama")
        XCTAssertEqual(store.karts.count, 2)
        XCTAssertEqual(store.fifo.queue.count, 1)
        XCTAssertEqual(store.classification.count, 1)
        XCTAssertEqual(store.config?.boxLines, 2)
        XCTAssertTrue(store.raceStarted)
    }

    func testApplyUpdateMutatesSingleKart() throws {
        let store = RaceStore.makeForTests()
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self))

        let beforeLaps = store.karts[0].base.totalLaps

        let update = WsMessage(
            type: .update,
            data: nil,
            events: [
                makeEvent(event: "lap_completed", rowId: "k-1", kartNumber: 1, extra: [
                    "lastLapMs": .int(87000),
                    "totalLaps": .int(beforeLaps + 1),
                    "bestLapMs": .int(87000)
                ])
            ]
        )
        store.apply(message: update)

        XCTAssertEqual(store.karts[0].base.totalLaps, beforeLaps + 1)
        XCTAssertEqual(store.karts[0].base.lastLapMs, 87000)
        XCTAssertEqual(store.karts[1].base.totalLaps, 49, "other kart unchanged")
    }

    func testApplyFifoUpdate() throws {
        let store = RaceStore.makeForTests()
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self))
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "fifo_update", in: Self.self))

        XCTAssertEqual(store.fifo.queue.first?.kartNumber, 7)
        XCTAssertEqual(store.fifo.score, 90)
    }

    func testApplyReplayStatus() throws {
        let store = RaceStore.makeForTests()
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "replay_status", in: Self.self))
        XCTAssertEqual(store.replayStatus.active, true)
        XCTAssertEqual(store.replayStatus.speed, 2)
    }

    func testBoxCallActiveAutoClears() async throws {
        let store = RaceStore.makeForTests(boxCallTimeout: 0.2)
        let msg = WsMessage(type: .boxCall, data: nil, events: nil)
        store.apply(message: msg)
        XCTAssertTrue(store.boxCallActive)

        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertFalse(store.boxCallActive)
    }

    // MARK: Helpers
    private func makeEvent(event: String, rowId: String, kartNumber: Int, extra: [String: JSONValue]) -> WsUpdateEvent {
        var dict: [String: JSONValue] = [
            "event": .string(event),
            "rowId": .string(rowId),
            "kartNumber": .int(kartNumber)
        ]
        for (k, v) in extra { dict[k] = v }
        let json = try! JSONEncoder().encode(dict)
        return try! JSONDecoder().decode(WsUpdateEvent.self, from: json)
    }
}
