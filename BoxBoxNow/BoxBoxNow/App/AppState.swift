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

        // Propagate child VM changes to trigger SwiftUI re-render
        authVM.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)

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
