import Foundation
import Combine

final class AppState: ObservableObject {
    let authVM = AuthViewModel()
    let raceVM = RaceViewModel()
    let driverVM = DriverViewModel()
    let configVM = ConfigViewModel()
    let gpsVM = GPSViewModel()

    private var cancellables = Set<AnyCancellable>()

    init() {
        // Wire GPS pipeline: GPS samples → driver view
        gpsVM.onSample = { [weak self] sample in
            self?.driverVM.processSample(sample)
        }

        // When authenticated, load presets
        authVM.$isAuthenticated
            .removeDuplicates()
            .filter { $0 }
            .sink { [weak self] _ in
                Task { await self?.driverVM.loadPresets() }
            }
            .store(in: &cancellables)
    }
}
