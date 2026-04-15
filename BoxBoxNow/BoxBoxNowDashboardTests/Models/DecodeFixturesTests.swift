import XCTest
@testable import BoxBoxNowDashboard

final class DecodeFixturesTests: XCTestCase {
    func testDecodesSnapshot() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        XCTAssertEqual(msg.type, .snapshot)
        XCTAssertEqual(msg.data?.trackName, "Jarama")
        XCTAssertEqual(msg.data?.karts?.count, 2)
        XCTAssertEqual(msg.data?.karts?.first?.base.kartNumber, 1)
        XCTAssertEqual(msg.data?.config?.boxLines, 2)
        XCTAssertEqual(msg.data?.fifo?.queue.count, 1)
        XCTAssertEqual(msg.data?.classification?.count, 1)
    }

    func testDecodesUpdateEventsWithExtra() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "update", in: Self.self)
        XCTAssertEqual(msg.type, .update)
        XCTAssertEqual(msg.events?.count, 2)
        let lap = msg.events?[0]
        XCTAssertEqual(lap?.event, "lap_completed")
        XCTAssertEqual(lap?.kartNumber, 1)
        XCTAssertEqual(lap?.extra["lapMs"], .int(88000))
        XCTAssertEqual(lap?.extra["totalLaps"], .int(51))
    }

    func testDecodesFifoUpdate() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "fifo_update", in: Self.self)
        XCTAssertEqual(msg.type, .fifoUpdate)
        XCTAssertEqual(msg.data?.fifo?.queue.first?.kartNumber, 7)
    }

    func testDecodesReplayStatus() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "replay_status", in: Self.self)
        XCTAssertEqual(msg.type, .replayStatus)
        XCTAssertEqual(msg.data?.replayStatus?.speed, 2)
        XCTAssertEqual(msg.data?.replayStatus?.progress ?? 0, 0.45, accuracy: 0.001)
    }
}
