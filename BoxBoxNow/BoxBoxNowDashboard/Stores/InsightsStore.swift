import Foundation
import Observation

@Observable
@MainActor
final class InsightsStore {
    var laps: [GPSLapSummary] = []
    var stats: GPSStats?
    var selectedLapDetail: GPSLapDetail?
    var isLoading = false
    var isLoadingDetail = false
    var lastError: String?

    private let service: InsightsService

    init(service: InsightsService = InsightsService()) {
        self.service = service
    }

    // MARK: - Load laps + stats in parallel

    func loadData(circuitId: Int?) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let fetchedLaps = service.laps(circuitId: circuitId)
            async let fetchedStats = service.stats(circuitId: circuitId)
            laps = try await fetchedLaps
            stats = try await fetchedStats
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    // MARK: - Load single lap detail

    func loadLapDetail(lapId: Int) async {
        isLoadingDetail = true
        defer { isLoadingDetail = false }
        do {
            selectedLapDetail = try await service.lapDetail(lapId: lapId)
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    // MARK: - Reset

    func reset() {
        laps = []
        stats = nil
        selectedLapDetail = nil
        isLoading = false
        isLoadingDetail = false
        lastError = nil
    }
}
