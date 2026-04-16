import Foundation
import Observation

@Observable
@MainActor
final class AnalyticsStore {
    var circuits: [Circuit] = []
    var selectedCircuitId: Int?
    var kartStats: [KartStats] = []
    var filterOutliers: Bool = true
    var isLoading: Bool = false
    var lastError: String?

    private let service: AnalyticsService

    init(service: AnalyticsService = AnalyticsService()) {
        self.service = service
    }

    // MARK: - Circuits

    func loadCircuits() async {
        isLoading = true
        defer { isLoading = false }
        do {
            circuits = try await service.circuits()
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    // MARK: - Kart Stats

    func loadStats(circuitId: Int, dateFrom: String?, dateTo: String?) async {
        isLoading = true
        defer { isLoading = false }
        do {
            kartStats = try await service.kartStats(
                circuitId: circuitId,
                dateFrom: dateFrom,
                dateTo: dateTo,
                filterOutliers: filterOutliers
            )
        } catch {
            lastError = ErrorMessages.userFacing(error)
        }
    }

    // MARK: - Detail Queries (not stored)

    func bestLaps(circuitId: Int, kartNumber: Int, dateFrom: String?, dateTo: String?) async -> [KartBestLap] {
        do {
            return try await service.kartBestLaps(
                circuitId: circuitId,
                kartNumber: kartNumber,
                dateFrom: dateFrom,
                dateTo: dateTo
            )
        } catch {
            lastError = ErrorMessages.userFacing(error)
            return []
        }
    }

    func drivers(circuitId: Int, kartNumber: Int, dateFrom: String?, dateTo: String?) async -> [KartDriver] {
        do {
            return try await service.kartDrivers(
                circuitId: circuitId,
                kartNumber: kartNumber,
                dateFrom: dateFrom,
                dateTo: dateTo
            )
        } catch {
            lastError = ErrorMessages.userFacing(error)
            return []
        }
    }

    // MARK: - Reset

    func reset() {
        circuits = []
        selectedCircuitId = nil
        kartStats = []
        filterOutliers = true
        isLoading = false
        lastError = nil
    }
}
