import Foundation

struct ReplayService {
    let api = APIClient.shared

    // MARK: - Browse

    struct RecordingsResponse: Decodable {
        let circuits: [RecordingCircuit]
    }

    func recordings() async throws -> [RecordingCircuit] {
        let r: RecordingsResponse = try await api.getJSON("/replay/recordings")
        return r.circuits
    }

    func analyzeLog(filename: String, circuitDir: String) async throws -> LogAnalysis {
        let encoded = filename.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? filename
        return try await api.getJSON("/replay/analyze/\(encoded)", query: [
            URLQueryItem(name: "circuit_dir", value: circuitDir)
        ])
    }

    // MARK: - Playback Control

    struct StartRequest: Encodable {
        let filename: String
        let speed: Double
        let startBlock: Int
        let circuitDir: String?

        enum CodingKeys: String, CodingKey {
            case filename, speed
            case startBlock = "start_block"
            case circuitDir = "circuit_dir"
        }
    }

    func startReplay(filename: String, speed: Double, startBlock: Int, circuitDir: String?) async throws {
        let body = StartRequest(filename: filename, speed: speed, startBlock: startBlock, circuitDir: circuitDir)
        let _: EmptyBody = try await api.postJSON("/replay/start", body: body)
    }

    func stopReplay() async throws {
        let _: EmptyBody = try await api.postJSON("/replay/stop", body: EmptyBody())
    }

    func pauseReplay() async throws {
        let _: EmptyBody = try await api.postJSON("/replay/pause", body: EmptyBody())
    }

    struct SeekRequest: Encodable { let block: Int }

    func seekReplay(block: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/replay/seek", body: SeekRequest(block: block))
    }

    struct SpeedRequest: Encodable { let speed: Double }

    func changeSpeed(_ speed: Double) async throws {
        let _: EmptyBody = try await api.postJSON("/replay/speed", body: SpeedRequest(speed: speed))
    }
}
