import Foundation
@testable import BoxBoxNowDashboard

final class MockRaceWebSocketClient: RaceWebSocketClientProtocol {
    let messages: AsyncStream<WsMessage>
    let connectionStates: AsyncStream<RaceConnectionState>

    private let msgCont: AsyncStream<WsMessage>.Continuation
    private let stateCont: AsyncStream<RaceConnectionState>.Continuation

    var sentFrames: [String] = []

    init() {
        var mc: AsyncStream<WsMessage>.Continuation!
        self.messages = AsyncStream<WsMessage> { mc = $0 }
        self.msgCont = mc

        var sc: AsyncStream<RaceConnectionState>.Continuation!
        self.connectionStates = AsyncStream<RaceConnectionState> { sc = $0 }
        self.stateCont = sc
    }

    func connect(url: URL, token: String) async { stateCont.yield(.connecting); stateCont.yield(.connected) }
    func disconnect() async { stateCont.yield(.disconnected(reason: .normal)) }
    func send(_ text: String) async throws { sentFrames.append(text) }

    // Test injection helpers
    func inject(_ message: WsMessage) { msgCont.yield(message) }
    func simulateClose(_ reason: RaceConnectionState.CloseReason) {
        stateCont.yield(.disconnected(reason: reason))
    }
    func finish() { msgCont.finish(); stateCont.finish() }
}
