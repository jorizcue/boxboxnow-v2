import Foundation
import Combine

final class RaceViewModel: ObservableObject {
    @Published var karts: [KartState] = []
    @Published var isConnected = false
    @Published var raceStatus = ""
    @Published var sessionName = ""
    @Published var boxCallActive = false

    func clearBoxCall() { boxCallActive = false }

    private let wsClient = WebSocketClient()
    private var cancellables = Set<AnyCancellable>()

    init() {
        wsClient.$isConnected
            .receive(on: DispatchQueue.main)
            .assign(to: &$isConnected)

        wsClient.onMessage = { [weak self] text in
            self?.handleMessage(text)
        }
    }

    func connect(circuitId: Int) { wsClient.connect(circuitId: circuitId) }
    func disconnect() { wsClient.disconnect() }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        if let type = json["type"] as? String {
            switch type {
            case "race_data":
                if let kartsData = json["karts"] as? [[String: Any]] {
                    parseKarts(kartsData)
                }
                if let status = json["status"] as? String { raceStatus = status }
                if let name = json["session_name"] as? String { sessionName = name }
            case "snapshot", "analytics":
                if let inner = json["data"] as? [String: Any],
                   let kartsData = inner["karts"] as? [[String: Any]] {
                    parseKarts(kartsData)
                }
            case "box_call":
                boxCallActive = true
            default: break
            }
        }
    }

    private func parseKarts(_ data: [[String: Any]]) {
        karts = data.compactMap { dict in
            guard let num = dict["kart_number"] as? Int else { return nil }
            return KartState(
                kartNumber: num,
                position: dict["position"] as? Int ?? 0,
                laps: dict["laps"] as? Int ?? 0,
                lastLapMs: dict["last_lap_ms"] as? Double,
                bestLapMs: dict["best_lap_ms"] as? Double,
                gapToLeaderMs: dict["gap_to_leader_ms"] as? Double,
                gapToAheadMs: dict["gap_to_ahead_ms"] as? Double,
                pitStops: dict["pit_stops"] as? Int ?? 0,
                isInPit: dict["is_in_pit"] as? Bool ?? false,
                stint: dict["stint"] as? Int ?? 1,
                speed: dict["speed"] as? Double,
                sector: dict["sector"] as? Int
            )
        }.sorted { $0.position < $1.position }
    }
}
