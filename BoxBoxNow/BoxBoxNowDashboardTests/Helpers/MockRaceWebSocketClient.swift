import Foundation
@testable import BoxBoxNowDashboard

actor MockRaceWebSocketClient: RaceWebSocketClientProtocol {
    nonisolated let messages: AsyncStream<WsMessage>
    nonisolated let connectionStates: AsyncStream<RaceConnectionState>

    nonisolated(unsafe) private let msgCont: AsyncStream<WsMessage>.Continuation
    nonisolated(unsafe) private let stateCont: AsyncStream<RaceConnectionState>.Continuation

    private(set) var sentFrames: [String] = []

    init() {
        var mc: AsyncStream<WsMessage>.Continuation!
        self.messages = AsyncStream<WsMessage> { mc = $0 }
        self.msgCont = mc

        var sc: AsyncStream<RaceConnectionState>.Continuation!
        self.connectionStates = AsyncStream<RaceConnectionState> { sc = $0 }
        self.stateCont = sc
    }

    func connect(url: URL, token: String) async {
        stateCont.yield(.connecting)
        stateCont.yield(.connected)
    }

    func disconnect() async {
        stateCont.yield(.disconnected(reason: .normal))
    }

    func send(_ text: String) async throws {
        sentFrames.append(text)
    }

    // Test injection helpers (actor-isolated; tests must await them).
    func inject(_ message: WsMessage) {
        msgCont.yield(message)
    }

    func simulateClose(_ reason: RaceConnectionState.CloseReason) {
        stateCont.yield(.disconnected(reason: reason))
    }

    func finish() {
        msgCont.finish()
        stateCont.finish()
    }
}
