import XCTest
@testable import BoxBoxNowDashboard

final class DecodeFixturesTests: XCTestCase {
    func testDecodesSnapshot() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        XCTAssertEqual(msg.type, .snapshot)

        let data = try XCTUnwrap(msg.data)
        XCTAssertEqual(data.trackName, "Jarama")
        XCTAssertEqual(data.config?.boxLines, 2)
        XCTAssertEqual(data.fifo?.queue.count, 1)
        XCTAssertEqual(data.classification?.count, 1)

        // Both karts must survive: pin the second element too so a decoder bug
        // that silently stops at index 0 would be caught.
        let karts = try XCTUnwrap(data.karts)
        XCTAssertEqual(karts.count, 2)
        XCTAssertEqual(karts[0].base.kartNumber, 1)
        XCTAssertEqual(karts[1].base.kartNumber, 7)
        XCTAssertEqual(karts[1].base.gap, "+4.123")

        // Pin KartStateFull-unique fields: if the custom init(from:) ever drops
        // any of these side dictionaries, the first-kart check goes red.
        XCTAssertEqual(karts[0].driverTotalMs["Alice"], 4_400_000)
        XCTAssertEqual(karts[0].driverAvgLapMs["Alice"], 88_100)
        XCTAssertEqual(karts[0].pitHistory, [])
        XCTAssertEqual(karts[0].recentLaps, [])
    }

    func testDecodesUpdateEventsWithExtra() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "update", in: Self.self)
        XCTAssertEqual(msg.type, .update)

        let events = try XCTUnwrap(msg.events)
        XCTAssertEqual(events.count, 2)

        // First event: lap completion with two extra fields.
        XCTAssertEqual(events[0].event, "lap_completed")
        XCTAssertEqual(events[0].rowId, "k-1")
        XCTAssertEqual(events[0].kartNumber, 1)
        XCTAssertEqual(events[0].extra["lapMs"], .int(88_000))
        XCTAssertEqual(events[0].extra["totalLaps"], .int(51))

        // Second event: pit entry with raceTimeMs in extra. Pinned so a decoder
        // that silently drops or duplicates events goes red.
        XCTAssertEqual(events[1].event, "pit_entered")
        XCTAssertEqual(events[1].rowId, "k-7")
        XCTAssertEqual(events[1].kartNumber, 7)
        XCTAssertEqual(events[1].extra["raceTimeMs"], .int(4_500_000))
    }

    func testDecodesFifoUpdate() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "fifo_update", in: Self.self)
        XCTAssertEqual(msg.type, .fifoUpdate)
        XCTAssertEqual(msg.data?.fifo?.queue.first?.kartNumber, 7)
    }

    func testDecodesReplayStatus() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "replay_status", in: Self.self)
        XCTAssertEqual(msg.type, .replayStatus)

        // Pin every field of ReplayStatus — the entire struct is the contract,
        // and a silent key rename (e.g. `active` → `isActive`) would pass if we
        // only checked a subset.
        let replay = try XCTUnwrap(msg.data?.replayStatus)
        XCTAssertTrue(replay.active)
        XCTAssertEqual(replay.filename, "jarama_2026_03_15.jsonl")
        XCTAssertEqual(replay.progress, 0.45, accuracy: 0.001)
        XCTAssertEqual(replay.speed, 2)
        XCTAssertFalse(replay.paused)
    }
}
