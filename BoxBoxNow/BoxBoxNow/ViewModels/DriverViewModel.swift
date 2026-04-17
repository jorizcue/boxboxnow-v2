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
    @Published var audioEnabled: Bool = true

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
        if defaults.object(forKey: Constants.Keys.audioEnabled) != nil {
            audioEnabled = defaults.bool(forKey: Constants.Keys.audioEnabled)
        }

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

        // Listen for live default-preset changes coming from the web
        // via the race WebSocket. RaceViewModel re-posts them as
        // `.presetDefaultChanged` notifications.
        NotificationCenter.default.addObserver(
            forName: .presetDefaultChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.applyDefaultPresetIfAny() }
        }
    }

    func saveConfig() {
        if let data = try? JSONEncoder().encode(visibleCards) {
            defaults.set(data, forKey: Constants.Keys.visibleCards)
        }
        defaults.set(cardOrder, forKey: Constants.Keys.cardOrder)
        defaults.set(brightness, forKey: Constants.Keys.brightness)
        defaults.set(orientationLock.rawValue, forKey: Constants.Keys.orientation)
        defaults.set(audioEnabled, forKey: Constants.Keys.audioEnabled)
    }

    func loadPresets(autoApplyDefault: Bool = false) async {
        do {
            let result = try await APIClient.shared.fetchPresets()
            await MainActor.run {
                self.presets = result
                if autoApplyDefault, let def = result.first(where: { $0.isDefault }) {
                    self.applyPreset(def)
                }
            }
        } catch { /* silently fail */ }
    }

    /// Fetch presets and, if a default exists, immediately apply it.
    /// Called by DriverView.onAppear so the pilot always lands on the
    /// layout their coach marked as "predefinida".
    func applyDefaultPresetIfAny() async {
        await loadPresets(autoApplyDefault: true)
    }

    func applyPreset(_ preset: DriverConfigPreset) {
        visibleCards = preset.visibleCards
        cardOrder = preset.cardOrder
        selectedPresetId = preset.id
        if let c = preset.contrast { brightness = c }
        if let o = preset.orientation, let lock = OrientationLock(rawValue: o) {
            orientationLock = lock
        }
        if let a = preset.audioEnabled { audioEnabled = a }
        saveConfig()
    }

    func saveAsPreset(name: String, isDefault: Bool = false) async throws {
        let preset = try await APIClient.shared.createPreset(
            name: name, visibleCards: visibleCards, cardOrder: cardOrder, isDefault: isDefault)
        await MainActor.run {
            if isDefault {
                self.presets = self.presets.map { p in
                    DriverConfigPreset(
                        id: p.id, name: p.name,
                        visibleCards: p.visibleCards, cardOrder: p.cardOrder,
                        isDefault: false
                    )
                }
            }
            self.presets.append(preset)
        }
    }

    func saveAsPreset(name: String, visibleCards: [String: Bool], cardOrder: [String],
                      contrast: Double, orientation: String, audioEnabled: Bool,
                      isDefault: Bool = false) async throws {
        let preset = try await APIClient.shared.createPreset(
            name: name, visibleCards: visibleCards, cardOrder: cardOrder,
            isDefault: isDefault, contrast: contrast, orientation: orientation,
            audioEnabled: audioEnabled)
        await MainActor.run {
            if isDefault {
                // Flip ONLY is_default on the other presets. The previous
                // rebuild omitted contrast/orientation/audioEnabled, so
                // those fields got silently nuked in the local copy —
                // the next time the user applied one of those presets
                // the driver view fell back to defaults. Fix: preserve
                // every field and only toggle isDefault.
                self.presets = self.presets.map { p in
                    DriverConfigPreset(
                        id: p.id, name: p.name,
                        visibleCards: p.visibleCards, cardOrder: p.cardOrder,
                        isDefault: false,
                        contrast: p.contrast,
                        orientation: p.orientation,
                        audioEnabled: p.audioEnabled
                    )
                }
            }
            self.presets.append(preset)
        }
    }

    func setPresetDefault(_ preset: DriverConfigPreset, isDefault: Bool) async throws {
        let updated = try await APIClient.shared.updatePreset(
            id: preset.id, isDefault: isDefault
        )
        await MainActor.run {
            self.presets = self.presets.map { p in
                if p.id == updated.id { return updated }
                // Enforce single-default client-side too — preserving
                // every other field (see note in saveAsPreset).
                if isDefault {
                    return DriverConfigPreset(
                        id: p.id, name: p.name,
                        visibleCards: p.visibleCards, cardOrder: p.cardOrder,
                        isDefault: false,
                        contrast: p.contrast,
                        orientation: p.orientation,
                        audioEnabled: p.audioEnabled
                    )
                }
                return p
            }
        }
    }

    func updatePresetFull(id: Int, name: String, visibleCards: [String: Bool], cardOrder: [String],
                         contrast: Double, orientation: String, audioEnabled: Bool) async throws {
        let updated = try await APIClient.shared.updatePreset(
            id: id, name: name, visibleCards: visibleCards, cardOrder: cardOrder,
            contrast: contrast, orientation: orientation, audioEnabled: audioEnabled)
        await MainActor.run {
            self.presets = self.presets.map { $0.id == updated.id ? updated : $0 }
        }
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
