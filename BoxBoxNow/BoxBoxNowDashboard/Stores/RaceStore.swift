import Foundation
import Observation

@Observable
@MainActor
final class RaceStore {

    // MARK: - Observable state

    var isConnected: Bool = false
    var reconnectReason: RaceConnectionState.CloseReason?

    var raceStarted: Bool = false
    var raceFinished: Bool = false
    var countdownMs: Double = 0
    var durationMs: Double = 0
    var trackName: String = ""

    var karts: [KartStateFull] = []
    var fifo: FifoState = .empty
    var classification: [ClassificationEntry] = []
    var config: RaceConfig?

    var replayStatus: ReplayStatus = .idle
    var boxCallActive: Bool = false
    var teams: [Team] = []

    // MARK: - Dependencies

    private let wsClient: RaceWebSocketClientProtocol
    private let boxCallTimeout: TimeInterval
    private var messagesTask: Task<Void, Never>?
    private var statesTask: Task<Void, Never>?
    private var boxCallClearTask: Task<Void, Never>?

    init(wsClient: RaceWebSocketClientProtocol = RaceWebSocketClient(), boxCallTimeout: TimeInterval = 10) {
        self.wsClient = wsClient
        self.boxCallTimeout = boxCallTimeout
        startObservingClient()
    }

    // Note: no `deinit` cleanup — Task<Void, Never> holds only a `[weak self]`
    // reference to the store, and the `for await` loops exit naturally when
    // the client's AsyncStreams finish. Tasks are unowned by the store, so a
    // deallocating RaceStore does not leak them.

    // MARK: - Public API

    func connect(token: String, view: String = "full") async {
        let url = URL(string: "\(Constants.wsBaseURL)/race?token=\(token)&view=\(view)&device=web")!
        await wsClient.connect(url: url, token: token)
    }

    func disconnect() async {
        await wsClient.disconnect()
    }

    // MARK: - Reducer (pure, sync, testable)

    func apply(message: WsMessage) {
        switch message.type {
        case .snapshot:
            applySnapshot(message.data)
        case .update:
            applyUpdateEvents(message.events ?? [])
        case .fifoUpdate:
            if let fifo = message.data?.fifo { self.fifo = fifo }
        case .analytics:
            applyAnalytics(message.data)
        case .replayStatus:
            if let rs = message.data?.replayStatus { self.replayStatus = rs }
        case .teamsUpdated:
            if let teams = message.data?.teams { self.teams = teams }
        case .boxCall:
            triggerBoxCall()
        }
    }

    private func applySnapshot(_ data: WsMessageData?) {
        guard let data else { return }
        self.raceStarted  = data.raceStarted ?? false
        self.raceFinished = data.raceFinished ?? false
        self.countdownMs  = data.countdownMs ?? 0
        self.durationMs   = data.durationMs ?? 0
        self.trackName    = data.trackName ?? ""
        self.karts        = data.karts ?? []
        self.fifo         = data.fifo ?? .empty
        self.classification = data.classification ?? []
        self.config       = data.config
    }

    private func applyUpdateEvents(_ events: [WsUpdateEvent]) {
        for ev in events {
            guard let rowId = ev.rowId,
                  let idx = karts.firstIndex(where: { $0.base.rowId == rowId }) else {
                continue
            }
            if let v = ev.extra["lastLapMs"]?.doubleValue { karts[idx].base.lastLapMs = v }
            if let v = ev.extra["bestLapMs"]?.doubleValue { karts[idx].base.bestLapMs = v }
            if let v = ev.extra["avgLapMs"]?.doubleValue { karts[idx].base.avgLapMs = v }
            if let v = ev.extra["totalLaps"]?.intValue { karts[idx].base.totalLaps = v }
            if let v = ev.extra["position"]?.intValue { karts[idx].base.position = v }
            if let v = ev.extra["pitCount"]?.intValue { karts[idx].base.pitCount = v }
            if let v = ev.extra["pitStatus"]?.stringValue { karts[idx].base.pitStatus = v }
            if let v = ev.extra["gap"]?.stringValue { karts[idx].base.gap = v }
            if let v = ev.extra["interval"]?.stringValue { karts[idx].base.interval = v }
            if let v = ev.extra["driverName"]?.stringValue { karts[idx].base.driverName = v }
            if let v = ev.extra["tierScore"]?.doubleValue { karts[idx].base.tierScore = v }
        }
    }

    private func applyAnalytics(_ data: WsMessageData?) {
        // Phase C will flesh this out; for Phase A we accept the message without
        // state changes to keep the pipeline unblocked.
    }

    private func triggerBoxCall() {
        boxCallActive = true
        boxCallClearTask?.cancel()
        let timeout = boxCallTimeout
        boxCallClearTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await MainActor.run { self?.boxCallActive = false }
        }
    }

    func clearBoxCall() {
        boxCallClearTask?.cancel()
        boxCallActive = false
    }

    // MARK: - WebSocket wiring

    private func startObservingClient() {
        let client = wsClient
        messagesTask = Task { [weak self] in
            for await msg in client.messages {
                guard let self else { return }
                await MainActor.run { self.apply(message: msg) }
            }
        }
        statesTask = Task { [weak self] in
            for await state in client.connectionStates {
                guard let self else { return }
                await MainActor.run { self.handleState(state) }
            }
        }
    }

    private func handleState(_ state: RaceConnectionState) {
        switch state {
        case .connecting:
            self.isConnected = false
        case .connected:
            self.isConnected = true
            self.reconnectReason = nil
        case .disconnected(let reason):
            self.isConnected = false
            self.reconnectReason = reason
        }
    }
}
