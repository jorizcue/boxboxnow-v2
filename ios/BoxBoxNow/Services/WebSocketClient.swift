import Foundation
import Combine

final class WebSocketClient: ObservableObject {
    @Published var isConnected = false
    var onMessage: ((String) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var reconnectDelay: TimeInterval = 1
    private let maxReconnectDelay: TimeInterval = 30
    private var circuitId: Int?
    private var shouldReconnect = false

    func connect(circuitId: Int) {
        self.circuitId = circuitId
        shouldReconnect = true
        reconnectDelay = 1
        openConnection()
    }

    func disconnect() {
        shouldReconnect = false
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        DispatchQueue.main.async { self.isConnected = false }
    }

    func send(_ text: String) { task?.send(.string(text)) { _ in } }

    private func openConnection() {
        guard let cid = circuitId else { return }
        var urlStr = "\(Constants.wsBaseURL)/race/\(cid)"
        if let token = KeychainHelper.loadToken() { urlStr += "?token=\(token)" }
        guard let url = URL(string: urlStr) else { return }
        task = URLSession(configuration: .default).webSocketTask(with: url)
        task?.resume()
        DispatchQueue.main.async { self.isConnected = true }
        reconnectDelay = 1
        listen()
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let msg):
                if case .string(let text) = msg {
                    DispatchQueue.main.async { self.onMessage?(text) }
                }
                self.listen()
            case .failure:
                DispatchQueue.main.async { self.isConnected = false }
                self.scheduleReconnect()
            }
        }
    }

    private func scheduleReconnect() {
        guard shouldReconnect else { return }
        DispatchQueue.global().asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
            guard let self = self, self.shouldReconnect else { return }
            self.reconnectDelay = min(self.reconnectDelay * 2, self.maxReconnectDelay)
            self.openConnection()
        }
    }
}
