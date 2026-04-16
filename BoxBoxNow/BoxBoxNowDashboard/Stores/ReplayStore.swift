import Foundation
import Observation

@Observable
@MainActor
final class ReplayStore {
    var circuits: [RecordingCircuit] = []
    var selectedCircuitDir: String?
    var dayAnalyses: [DayAnalysis] = []
    var speed: Double = 10.0
    var isLoading: Bool = false
    var lastError: String?

    private let service: ReplayService

    init(service: ReplayService = ReplayService()) {
        self.service = service
    }

    // MARK: - Browse

    func loadRecordings() async {
        isLoading = true
        defer { isLoading = false }
        do {
            circuits = try await service.recordings()
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    func selectCircuit(_ dir: String, dateFrom: String, dateTo: String) async {
        selectedCircuitDir = dir
        guard let circuit = circuits.first(where: { $0.circuitDir == dir }) else { return }

        let filtered = circuit.dates.filter { $0 >= dateFrom && $0 <= dateTo }
        dayAnalyses = filtered.map { DayAnalysis(date: $0, filename: "\($0).log") }

        for i in dayAnalyses.indices {
            dayAnalyses[i].isLoading = true
            do {
                let analysis = try await service.analyzeLog(
                    filename: dayAnalyses[i].filename,
                    circuitDir: dir
                )
                dayAnalyses[i].analysis = analysis
            } catch {
                lastError = ErrorMessages.userFacing(error)
            }
            dayAnalyses[i].isLoading = false
        }
    }

    func deselectCircuit() {
        selectedCircuitDir = nil
        dayAnalyses = []
    }

    // MARK: - Playback Control

    func startReplay(filename: String, circuitDir: String, startBlock: Int) async {
        do {
            try await service.startReplay(
                filename: filename,
                speed: speed,
                startBlock: startBlock,
                circuitDir: circuitDir
            )
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    func stopReplay() async {
        do {
            try await service.stopReplay()
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    func pauseReplay() async {
        do {
            try await service.pauseReplay()
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    func seekReplay(block: Int) async {
        do {
            try await service.seekReplay(block: block)
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    func changeSpeed(_ newSpeed: Double) async {
        speed = newSpeed
        do {
            try await service.changeSpeed(newSpeed)
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    func reset() {
        circuits = []
        selectedCircuitDir = nil
        dayAnalyses = []
        speed = 10.0
        isLoading = false
        lastError = nil
    }
}

// MARK: - Supporting Types

struct DayAnalysis: Identifiable {
    let date: String
    let filename: String
    var analysis: LogAnalysis?
    var isLoading: Bool = false

    var id: String { date }
}
