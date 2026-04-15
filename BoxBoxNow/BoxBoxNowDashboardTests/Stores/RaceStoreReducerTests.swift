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

        let beforeLaps0 = store.karts[0].base.totalLaps
        let beforeLaps1 = store.karts[1].base.totalLaps

        // Update k-1 (karts[0])
        let update1 = WsMessage(
            type: .update,
            data: nil,
            events: [makeEvent(event: "lap_completed", rowId: "k-1", kartNumber: 1, extra: [
                "lastLapMs": .int(87000),
                "totalLaps": .int(beforeLaps0 + 1),
                "bestLapMs": .int(87000)
            ])]
        )
        store.apply(message: update1)
        XCTAssertEqual(store.karts[0].base.totalLaps, beforeLaps0 + 1)
        XCTAssertEqual(store.karts[0].base.lastLapMs, 87000)
        XCTAssertEqual(store.karts[1].base.totalLaps, beforeLaps1, "karts[1] must be unchanged after k-1 update")

        // Update k-7 (karts[1]) — exercises rowId lookup against the non-first kart
        let update2 = WsMessage(
            type: .update,
            data: nil,
            events: [makeEvent(event: "lap_completed", rowId: "k-7", kartNumber: 7, extra: [
                "totalLaps": .int(beforeLaps1 + 1)
            ])]
        )
        store.apply(message: update2)
        XCTAssertEqual(store.karts[1].base.totalLaps, beforeLaps1 + 1)
        XCTAssertEqual(store.karts[0].base.totalLaps, beforeLaps0 + 1, "karts[0] must still reflect its prior update")
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

        try await AsyncTestHelpers.waitUntil(timeout: 1.0) { !store.boxCallActive }
    }

    func testRapidBoxCallSucceedingLatestSticks() async throws {
        let store = RaceStore.makeForTests(boxCallTimeout: 0.1)
        let msg = WsMessage(type: .boxCall, data: nil, events: nil)
        store.apply(message: msg)
        // Let the first clear task approach its deadline but not quite fire
        try await Task.sleep(nanoseconds: 80_000_000)
        // Second trigger restarts the window; the first task's eventual fire must not clobber this one
        store.apply(message: msg)
        try await Task.sleep(nanoseconds: 50_000_000)
        // At t=130ms, first task's sleep has completed. Second task still has ~50ms left.
        // Active must still be true despite the stale first task.
        XCTAssertTrue(store.boxCallActive, "rapid successive box calls must not clobber each other")
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
