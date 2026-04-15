import Foundation

/// Protocol so stores can depend on a mockable type.
protocol RaceWebSocketClientProtocol: AnyObject {
    var messages: AsyncStream<WsMessage> { get }
    var connectionStates: AsyncStream<RaceConnectionState> { get }

    func connect(url: URL, token: String) async
    func disconnect() async
    func send(_ text: String) async throws
}

enum RaceConnectionState: Equatable {
    case connecting
    case connected
    case disconnected(reason: CloseReason)

    enum CloseReason: Equatable {
        case normal
        case sessionTerminated   // 4001
        case maxDevices          // 4003
        case networkError(String?)
    }
}

/// Actor-isolated WebSocket client.
/// - Single reconnect loop (no racy watchdog).
/// - 15s sendPing keepalive.
/// - Exponential backoff 1s → 30s between reconnects.
actor RaceWebSocketClient: RaceWebSocketClientProtocol {

    // MARK: - Public streams

    nonisolated let messages: AsyncStream<WsMessage>
    nonisolated let connectionStates: AsyncStream<RaceConnectionState>

    nonisolated(unsafe) private let messagesContinuation: AsyncStream<WsMessage>.Continuation
    nonisolated(unsafe) private let stateContinuation: AsyncStream<RaceConnectionState>.Continuation

    // MARK: - Internal state

    private var task: URLSessionWebSocketTask?
    private var pingTask: Task<Void, Never>?
    private var readTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?

    private var shouldReconnect = false
    private var reconnectDelayMs: UInt64 = 1_000
    private let maxReconnectDelayMs: UInt64 = 30_000

    /// Monotonic session counter. Incremented by `connect()` so any in-flight
    /// `reconnectTask` whose sleep has already completed can detect it is stale
    /// before queueing a `connectLoop()` call onto the actor. Without this, a
    /// stale reconnect can land after a new user-initiated `connect()` and
    /// silently overwrite the live session's `task`/`pingTask`/`readTask`.
    private var sessionGeneration: UInt64 = 0

    private var currentURL: URL?
    private var currentToken: String?

    private let session: URLSession

    init(session: URLSession = URLSession(configuration: .default)) {
        self.session = session

        var msgCont: AsyncStream<WsMessage>.Continuation!
        self.messages = AsyncStream<WsMessage> { msgCont = $0 }
        self.messagesContinuation = msgCont

        var stateCont: AsyncStream<RaceConnectionState>.Continuation!
        self.connectionStates = AsyncStream<RaceConnectionState> { stateCont = $0 }
        self.stateContinuation = stateCont
    }

    deinit {
        messagesContinuation.finish()
        stateContinuation.finish()
    }

    // MARK: - Public API

    func connect(url: URL, token: String) async {
        sessionGeneration &+= 1   // Invalidate any pending reconnect from prior session.

        // Tear down any prior session before starting a new one.
        pingTask?.cancel(); pingTask = nil
        readTask?.cancel(); readTask = nil
        reconnectTask?.cancel(); reconnectTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil

        currentURL = url
        currentToken = token
        shouldReconnect = true
        reconnectDelayMs = 1_000
        await connectLoop()
    }

    func disconnect() async {
        shouldReconnect = false
        reconnectTask?.cancel(); reconnectTask = nil
        pingTask?.cancel(); pingTask = nil
        readTask?.cancel(); readTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        stateContinuation.yield(.disconnected(reason: .normal))
    }

    func send(_ text: String) async throws {
        guard let task else { throw URLError(.notConnectedToInternet) }
        try await task.send(.string(text))
    }

    // MARK: - Internals

    private func connectLoop() async {
        stateContinuation.yield(.connecting)
        guard let url = currentURL else { return }

        let newTask = session.webSocketTask(with: url)
        self.task = newTask
        newTask.resume()

        // Keepalive: ping every 15s. Matches the Android driver fix (pingIntervalMillis = 15_000).
        pingTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }
                await self?.sendPing()
            }
        }

        // Assume connected once resume() is called. WS handshake errors surface via receive().
        stateContinuation.yield(.connected)
        reconnectDelayMs = 1_000

        readTask = Task { [weak self] in
            await self?.readLoop(newTask)
        }
    }

    private func sendPing() async {
        guard let task else { return }
        task.sendPing { [weak self] error in
            guard let self, let error else { return }
            let description = error.localizedDescription
            Task { await self.handleDisconnect(reason: .networkError(description)) }
        }
    }

    private func readLoop(_ task: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    if let data = text.data(using: .utf8) {
                        if let wsMsg = try? JSONDecoder().decode(WsMessage.self, from: data) {
                            messagesContinuation.yield(wsMsg)
                        } else {
                            #if DEBUG
                            print("[RaceWebSocketClient] failed to decode string frame: \(text.prefix(200))")
                            #endif
                        }
                    }
                case .data(let data):
                    if let wsMsg = try? JSONDecoder().decode(WsMessage.self, from: data) {
                        messagesContinuation.yield(wsMsg)
                    } else {
                        #if DEBUG
                        print("[RaceWebSocketClient] failed to decode data frame (\(data.count) bytes)")
                        #endif
                    }
                @unknown default:
                    continue
                }
            } catch {
                let reason = mapCloseReason(task: task, error: error)
                await handleDisconnect(reason: reason)
                return
            }
        }
    }

    private func mapCloseReason(task: URLSessionWebSocketTask, error: Error) -> RaceConnectionState.CloseReason {
        if error is CancellationError { return .normal }
        if (error as? URLError)?.code == .cancelled { return .normal }
        let code = task.closeCode.rawValue
        if code == 4001 { return .sessionTerminated }
        if code == 4003 { return .maxDevices }
        return .networkError((error as NSError).localizedDescription)
    }

    private func handleDisconnect(reason: RaceConnectionState.CloseReason) async {
        // Idempotency guard — prior call already cleaned up.
        guard task != nil else { return }
        pingTask?.cancel(); pingTask = nil
        readTask?.cancel(); readTask = nil
        task = nil
        stateContinuation.yield(.disconnected(reason: reason))

        // Terminal reasons: do not retry
        if case .sessionTerminated = reason {
            shouldReconnect = false
            reconnectTask?.cancel(); reconnectTask = nil
            return
        }
        if case .maxDevices = reason {
            shouldReconnect = false
            reconnectTask?.cancel(); reconnectTask = nil
            return
        }
        if case .normal = reason { return }

        // Transient reasons: exponential backoff reconnect
        guard shouldReconnect else { return }
        let delay = reconnectDelayMs
        reconnectDelayMs = min(reconnectDelayMs * 2, maxReconnectDelayMs)

        let gen = sessionGeneration
        reconnectTask = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: delay * 1_000_000) } catch { return }
            await self?.reconnectIfCurrent(generation: gen)
        }
    }

    /// Actor-isolated reconnect entry point. The generation check bails out if
    /// `connect()` has been called since this reconnect was scheduled, preventing
    /// a stale backoff timer from clobbering a fresh session.
    private func reconnectIfCurrent(generation: UInt64) async {
        guard generation == sessionGeneration else { return }
        await connectLoop()
    }
}
