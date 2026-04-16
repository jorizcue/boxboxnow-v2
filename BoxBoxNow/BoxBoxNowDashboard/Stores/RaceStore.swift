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

    /// Locally interpolated race clock. The server sends `countdownMs` on
    /// every snapshot (~30s apart). Without interpolation the header timer
    /// and per-kart stint calculation would only advance on snapshot boundaries.
    /// This field ticks every second between snapshots, mirroring the web
    /// `useRaceClock` hook. Reset whenever `countdownMs` is reassigned.
    var interpolatedCountdownMs: Double = 0
    private var lastCountdownSnapshotAt: Date = .distantPast
    private var clockTickTask: Task<Void, Never>?

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
    private var boxCallGeneration: UInt64 = 0

    init(wsClient: RaceWebSocketClientProtocol = RaceWebSocketClient(), boxCallTimeout: TimeInterval = 10) {
        self.wsClient = wsClient
        self.boxCallTimeout = boxCallTimeout
        startObservingClient()
        startClockTick()
    }

    /// 1 Hz ticker that advances `interpolatedCountdownMs` between snapshots.
    /// Subtracts wall-clock elapsed since the last server update from the
    /// snapshot value — same math as the web `useRaceClock` hook.
    private func startClockTick() {
        clockTickTask?.cancel()
        clockTickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                await MainActor.run {
                    guard let self else { return }
                    guard self.countdownMs > 0 else {
                        self.interpolatedCountdownMs = self.countdownMs
                        return
                    }
                    let elapsed = Date().timeIntervalSince(self.lastCountdownSnapshotAt) * 1000
                    self.interpolatedCountdownMs = max(0, self.countdownMs - elapsed)
                }
            }
        }
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

    func sendBoxCall() async {
        try? await wsClient.send("{\"type\":\"box_call\"}")
    }

    // MARK: - Reducer (pure, sync, testable)

    func apply(message: WsMessage) {
        switch message.type {
        case .snapshot:
            applySnapshot(message.data)
        case .update:
            applyUpdateEvents(message.events ?? [])
        case .fifoUpdate:
            // Intentional: a `.fifoUpdate` with `data.fifo == nil` is treated as a
            // no-op, not a clear. The server-side invariant is that every
            // `fifo_update` carries a full `data.fifo` payload; a nil here means
            // "malformed message" and we prefer stale-but-valid state over blanking
            // the queue. If the server ever starts sending nil to mean "cleared",
            // change this branch to `self.fifo = message.data?.fifo ?? .empty`.
            if let fifo = message.data?.fifo { self.fifo = fifo }
        case .analytics:
            applyAnalytics(message.data)
        case .replayStatus:
            if let rs = message.data?.replayStatus { self.replayStatus = rs }
        case .teamsUpdated:
            if let teams = message.data?.teams { self.teams = teams }
        case .boxCall:
            triggerBoxCall()
        case .unknown:
            // Server emits types we don't model yet (e.g.
            // `preset_default_changed`). Ignore silently instead of dropping
            // the whole frame at the decoder level.
            break
        }
    }

    private func applySnapshot(_ data: WsMessageData?) {
        guard let data else { return }
        self.raceStarted  = data.raceStarted ?? false
        self.raceFinished = data.raceFinished ?? false
        let newCountdown = data.countdownMs ?? 0
        if newCountdown != self.countdownMs {
            self.lastCountdownSnapshotAt = Date()
        }
        self.countdownMs  = newCountdown
        self.interpolatedCountdownMs = newCountdown
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

    /// Analytics frames arrive roughly every second during an active race or
    /// replay and carry a recomputed view of the karts + FIFO + classification
    /// plus a fresh config block. The original stub treated them as no-ops,
    /// which was fine when we received a snapshot every 30s — but during a
    /// replay the server only sends ONE snapshot on connect, then relies on
    /// `update` events (per-field, keyed by rowId) and these `analytics`
    /// frames (full recompute). Ignoring analytics meant brand-new karts that
    /// appeared mid-replay never entered the store and every row we had
    /// remained frozen at its initial snapshot values.
    private func applyAnalytics(_ data: WsMessageData?) {
        guard let data else { return }
        if let karts = data.karts { self.karts = karts }
        if let fifo = data.fifo { self.fifo = fifo }
        if let classification = data.classification { self.classification = classification }
        if let config = data.config { self.config = config }
    }

    private func triggerBoxCall() {
        boxCallActive = true
        boxCallClearTask?.cancel()
        boxCallGeneration &+= 1
        let timeout = boxCallTimeout
        let gen = boxCallGeneration
        boxCallClearTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.boxCallGeneration == gen else { return }
                self.boxCallActive = false
            }
        }
    }

    func clearBoxCall() {
        boxCallClearTask?.cancel()
        boxCallGeneration &+= 1
        boxCallActive = false
    }

    /// Clears all race-data state back to initial values. Called on logout
    /// so a subsequent login on the same RaceStore instance doesn't briefly
    /// flash the previous user's race data at the new user. Does NOT touch
    /// WS connection state (`isConnected`, `reconnectReason`) — those are
    /// driven by `handleState` from the WS observer and remain authoritative.
    func reset() {
        raceStarted = false
        raceFinished = false
        countdownMs = 0
        interpolatedCountdownMs = 0
        lastCountdownSnapshotAt = .distantPast
        durationMs = 0
        trackName = ""
        karts = []
        fifo = .empty
        classification = []
        config = nil
        replayStatus = .idle
        teams = []
        boxCallClearTask?.cancel()
        boxCallClearTask = nil
        boxCallActive = false
        boxCallGeneration &+= 1  // invalidate any in-flight clear task
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
            // Intentional: do NOT clear reconnectReason here. UI uses (reconnectReason != nil && !isConnected)
            // as a "reconnect in progress" signal so the banner stays visible across the
            // .disconnected → .connecting transition until we actually succeed at .connected.
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
