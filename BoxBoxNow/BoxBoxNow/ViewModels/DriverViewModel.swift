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
    @Published var visibleCards: [String: Bool] = DriverCard.defaultVisible
    @Published var cardOrder: [String] = DriverCard.defaultOrder
    @Published var presets: [DriverConfigPreset] = []
    @Published var selectedPresetId: Int?
    @Published var brightness: Double = 0.0  // 0 = normal, 1 = max contrast boost
    @Published var orientationLock: OrientationLock = .free

    // GPS-derived data
    @Published var gpsData: GPSSample?
    @Published var currentSpeed: Double = 0
    @Published var currentGForceX: Double = 0
    @Published var currentGForceY: Double = 0

    let lapTracker = LapTracker()

    private let defaults = UserDefaults.standard

    init() {
        // Load saved config from UserDefaults
        if let data = defaults.data(forKey: Constants.Keys.visibleCards),
           let dict = try? JSONDecoder().decode([String: Bool].self, from: data) {
            visibleCards = dict
        }
        if let arr = defaults.stringArray(forKey: Constants.Keys.cardOrder) {
            cardOrder = arr
        }
        if defaults.object(forKey: Constants.Keys.brightness) != nil {
            brightness = defaults.double(forKey: Constants.Keys.brightness)
        }
        let lockStr = defaults.string(forKey: Constants.Keys.orientation) ?? "free"
        orientationLock = OrientationLock(rawValue: lockStr) ?? .free

        // Migrate cached config: ensure any newly-added DriverCard cases
        // (e.g. pitCount, currentPit) are appended to cardOrder and visibleCards
        // so they show up for users who had a cached config from before the new
        // cards existed. Without this the `orderedVisibleCards` iteration would
        // never yield them because `cardOrder` wouldn't contain their rawValue.
        let allIds = DriverCard.allCases.map { $0.rawValue }
        let missing = allIds.filter { !cardOrder.contains($0) }
        if !missing.isEmpty {
            cardOrder.append(contentsOf: missing)
            for id in missing where visibleCards[id] == nil {
                // Default: visible for standard cards, off for GPS-only cards
                if let card = DriverCard(rawValue: id) {
                    visibleCards[id] = !card.requiresGPS
                }
            }
            // Persist immediately so the migration is sticky
            if let data = try? JSONEncoder().encode(visibleCards) {
                defaults.set(data, forKey: Constants.Keys.visibleCards)
            }
            defaults.set(cardOrder, forKey: Constants.Keys.cardOrder)
        }

        // Load persisted finish line for GPS lap tracking
        lapTracker.loadFinishLine()
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
        // Tag GPS source for backend upload
        lapTracker.gpsSource = sample.batteryPercent != nil ? "racebox" : "phone"
        lapTracker.processSample(sample)
    }

    var orderedVisibleCards: [DriverCard] {
        cardOrder.compactMap { key in
            guard visibleCards[key] == true else { return nil }
            return DriverCard(rawValue: key)
        }
    }
}
