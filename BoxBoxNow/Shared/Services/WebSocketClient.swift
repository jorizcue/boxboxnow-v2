import Foundation
import Combine

final class WebSocketClient: ObservableObject {
    @Published var isConnected = false
    var onMessage: ((String) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var reconnectDelay: TimeInterval = 1
    private let maxReconnectDelay: TimeInterval = 30
    private var circuitId: Int?
    private var directURL: String?
    private var shouldReconnect = false
    private var pingTimer: DispatchSourceTimer?
    private var lastMessageTime: Date = Date()

    func connect(circuitId: Int) {
        self.circuitId = circuitId
        self.directURL = nil
        shouldReconnect = true
        reconnectDelay = 1
        openConnection()
    }

    func connectToURL(_ urlString: String) {
        self.directURL = urlString
        self.circuitId = nil
        shouldReconnect = true
        reconnectDelay = 1
        doConnect(urlString)
    }

    func disconnect() {
        shouldReconnect = false
        stopPing()
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        DispatchQueue.main.async { self.isConnected = false }
    }

    func send(_ text: String) { task?.send(.string(text)) { _ in } }

    // MARK: - Internal

    private func doConnect(_ urlStr: String) {
        // Clean up previous connection
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil

        guard let url = URL(string: urlStr) else { return }
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        task = URLSession(configuration: config).webSocketTask(with: url)
        task?.resume()
        lastMessageTime = Date()
        DispatchQueue.main.async { self.isConnected = true }
        reconnectDelay = 1
        listen()
        startPing()
    }

    private func openConnection() {
        let urlStr: String
        if let direct = directURL {
            urlStr = direct
        } else if let cid = circuitId {
            var str = "\(Constants.wsBaseURL)/race/\(cid)"
            if let token = KeychainHelper.loadToken() { str += "?token=\(token)" }
            urlStr = str
        } else {
            return
        }
        doConnect(urlStr)
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let msg):
                self.lastMessageTime = Date()
                if case .string(let text) = msg {
                    DispatchQueue.main.async { self.onMessage?(text) }
                }
                self.listen()
            case .failure(let error):
                print("[WS] Receive failed: \(error.localizedDescription)")
                DispatchQueue.main.async { self.isConnected = false }
                self.stopPing()
                self.scheduleReconnect()
            }
        }
    }

    // MARK: - Ping/keepalive: detect dead connections

    private func startPing() {
        stopPing()
        let timer = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        timer.schedule(deadline: .now() + 10, repeating: 10)
        timer.setEventHandler { [weak self] in
            self?.sendPing()
        }
        timer.resume()
        pingTimer = timer
    }

    private func stopPing() {
        pingTimer?.cancel()
        pingTimer = nil
    }

    private func sendPing() {
        guard shouldReconnect else { return }

        // If no message received in 30s, force reconnect
        let silence = Date().timeIntervalSince(lastMessageTime)
        if silence > 30 {
            print("[WS] No data for \(Int(silence))s — forcing reconnect")
            task?.cancel(with: .goingAway, reason: nil)
            task = nil
            DispatchQueue.main.async { self.isConnected = false }
            stopPing()
            scheduleReconnect()
            return
        }

        // Send WebSocket ping frame
        task?.sendPing { [weak self] error in
            if let error = error {
                print("[WS] Ping failed: \(error.localizedDescription)")
                guard let self = self else { return }
                DispatchQueue.main.async { self.isConnected = false }
                self.stopPing()
                self.scheduleReconnect()
            }
        }
    }

    private func scheduleReconnect() {
        guard shouldReconnect else { return }
        print("[WS] Reconnecting in \(reconnectDelay)s...")
        DispatchQueue.global().asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
            guard let self = self, self.shouldReconnect else { return }
            self.reconnectDelay = min(self.reconnectDelay * 2, self.maxReconnectDelay)
            self.openConnection()
        }
    }
}
