import Foundation
import Combine

enum OrientationLock: String, CaseIterable {
    case free = "free"
    case portrait = "portrait"
    case landscape = "landscape"

    var displayName: String {
        switch self {
        case .free: return "Libre"
        case .portrait: return "Vertical"
        case .landscape: return "Horizontal"
        }
    }
}

final class DriverViewModel: ObservableObject {
    @Published var visibleCards: [String: Bool]
    @Published var cardOrder: [String]
    @Published var presets: [DriverConfigPreset] = []
    @Published var selectedPresetId: Int?
    @Published var brightness: Double
    @Published var orientationLock: OrientationLock

    // GPS-derived data
    @Published var gpsData: GPSSample?
    @Published var currentSpeed: Double = 0
    @Published var currentGForceX: Double = 0
    @Published var currentGForceY: Double = 0

    let lapTracker = LapTracker()

    private let defaults = UserDefaults.standard

    init() {
        if let data = defaults.data(forKey: Constants.Keys.visibleCards),
           let dict = try? JSONDecoder().decode([String: Bool].self, from: data) {
            visibleCards = dict
        } else {
            visibleCards = DriverCard.defaultVisible
        }

        if let arr = defaults.stringArray(forKey: Constants.Keys.cardOrder) {
            cardOrder = arr
        } else {
            cardOrder = DriverCard.defaultOrder
        }

        brightness = defaults.double(forKey: Constants.Keys.brightness)
        if brightness == 0 { brightness = 1.0 }

        let lockStr = defaults.string(forKey: Constants.Keys.orientation) ?? "free"
        orientationLock = OrientationLock(rawValue: lockStr) ?? .free
    }

    func saveConfig() {
        if let data = try? JSONEncoder().encode(visibleCards) {
            defaults.set(data, forKey: Constants.Keys.visibleCards)
        }
        defaults.set(cardOrder, forKey: Constants.Keys.cardOrder)
        defaults.set(brightness, forKey: Constants.Keys.brightness)
        defaults.set(orientationLock.rawValue, forKey: Constants.Keys.orientation)
    }

    func loadPresets() async {
        do {
            let result = try await APIClient.shared.fetchPresets()
            await MainActor.run { self.presets = result }
        } catch { /* silently fail */ }
    }

    func applyPreset(_ preset: DriverConfigPreset) {
        visibleCards = preset.visibleCards
        cardOrder = preset.cardOrder
        selectedPresetId = preset.id
        saveConfig()
    }

    func saveAsPreset(name: String) async throws {
        let preset = try await APIClient.shared.createPreset(
            name: name, visibleCards: visibleCards, cardOrder: cardOrder)
        await MainActor.run { self.presets.append(preset) }
    }

    func deletePreset(_ preset: DriverConfigPreset) async throws {
        try await APIClient.shared.deletePreset(id: preset.id)
        await MainActor.run { self.presets.removeAll { $0.id == preset.id } }
    }

    func processSample(_ sample: GPSSample) {
        gpsData = sample
        currentSpeed = sample.speedKmh
        currentGForceX = sample.gForceX
        currentGForceY = sample.gForceY
        lapTracker.processSample(sample)
    }

    var orderedVisibleCards: [DriverCard] {
        cardOrder.compactMap { key in
            guard visibleCards[key] == true else { return nil }
            return DriverCard(rawValue: key)
        }
    }
}
