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

    // MARK: - Compare second lap

    /// Detail for an optional comparison lap loaded in parallel with
    /// `selectedLapDetail`. Used by the InsightsView compare mode to overlay
    /// two speed traces.
    var compareLapDetail: GPSLapDetail?

    func loadCompareLapDetail(lapId: Int) async {
        do {
            compareLapDetail = try await service.lapDetail(lapId: lapId)
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    func clearCompareLap() {
        compareLapDetail = nil
    }

    // MARK: - Delete

    /// Deletes a lap permanently and refreshes the local list. Returns true
    /// on success so the view can clear any UI state pinned to the lap.
    @discardableResult
    func deleteLap(lapId: Int) async -> Bool {
        do {
            try await service.deleteLap(lapId: lapId)
            laps.removeAll { $0.id == lapId }
            if selectedLapDetail?.id == lapId { selectedLapDetail = nil }
            if compareLapDetail?.id == lapId { compareLapDetail = nil }
            return true
        } catch {
            lastError = ErrorMessages.userFacing(error)
            return false
        }
    }

    // MARK: - Reset

    func reset() {
        laps = []
        stats = nil
        selectedLapDetail = nil
        compareLapDetail = nil
        isLoading = false
        isLoadingDetail = false
        lastError = nil
    }
}
