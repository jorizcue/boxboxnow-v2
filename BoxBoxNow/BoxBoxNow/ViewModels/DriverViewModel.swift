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
    /// True once `loadPresets()` has finished at least once for the
    /// current account. Lets DriverView distinguish "still loading the
    /// list" from "loaded and the user has zero presets" — the gate
    /// that blocks pilots without a plantilla relies on this.
    @Published var presetsLoaded: Bool = false

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
        // are appended to cardOrder + visibleCards so they show up for
        // pilots who had a cached config from before the new cards
        // existed. Centralized in `migrateMissingCards()` so we can
        // re-run it after `applyPreset` (which would otherwise wipe
        // newer cards out of cardOrder when a stale preset is applied).
        migrateMissingCards()

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

        // Wipe in-memory state when the active account changes (logout
        // or a different user logs in on the same device). UserDefaults
        // is cleared by AuthViewModel.wipeDriverConfigDefaults() *before*
        // the notification fires, so the disk reload below picks up
        // pristine defaults instead of the previous account's layout.
        NotificationCenter.default.addObserver(
            forName: .userAccountChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.resetToDefaults()
        }
    }

    /// Snap every per-user @Published property back to its module default.
    /// Called when the authenticated user changes — without this the
    /// VM keeps publishing the previous account's visibleCards / cardOrder
    /// even after the UserDefaults bucket has been wiped, so DriverView
    /// renders stale data until the next app launch.
    @MainActor
    private func resetToDefaults() {
        visibleCards = DriverCard.defaultVisible
        cardOrder = DriverCard.defaultOrder
        presets = []
        selectedPresetId = nil
        brightness = 0.0
        orientationLock = .free
        audioEnabled = true
        presetsLoaded = false
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
                self.presetsLoaded = true
                if autoApplyDefault {
                    // Prefer an explicit default, but fall back to the user's
                    // sole preset if they only have one and it isn't flagged —
                    // existing pilots who created their first template before
                    // the auto-default-on-create logic shipped would otherwise
                    // land on a blank driver view with no contrast /
                    // orientation / audio applied.
                    if let def = result.first(where: { $0.isDefault }) {
                        self.applyPreset(def)
                    } else if result.count == 1, let only = result.first {
                        self.applyPreset(only)
                    }
                }
            }
        } catch {
            // Even on failure mark the load as complete so the UI can
            // distinguish "still loading" from "the user genuinely has
            // no presets" — otherwise the gate spinner would never go
            // away on a flaky network.
            await MainActor.run { self.presetsLoaded = true }
        }
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
        // Stale presets (saved before newer cards existed) don't carry
        // their rawValues in cardOrder. `orderedVisibleCards` iterates
        // cardOrder so a missing entry would silently never render —
        // re-run the migration to append any DriverCard cases that
        // didn't make it into the preset's snapshot.
        migrateMissingCards()
        saveConfig()
    }

    /// Append any `DriverCard.allCases` rawValue that isn't already in
    /// `cardOrder`, defaulting `visibleCards` for the new entries to
    /// "on for standard cards, off for GPS-required". Idempotent —
    /// safe to call from init, after applyPreset, or after any other
    /// path that overwrites cardOrder/visibleCards from external data.
    private func migrateMissingCards() {
        let allIds = DriverCard.allCases.map { $0.rawValue }
        let missing = allIds.filter { !cardOrder.contains($0) }
        guard !missing.isEmpty else { return }
        cardOrder.append(contentsOf: missing)
        for id in missing where visibleCards[id] == nil {
            if let card = DriverCard(rawValue: id) {
                visibleCards[id] = !card.requiresGPS
            }
        }
        // Persist immediately so the migration is sticky across launches.
        if let data = try? JSONEncoder().encode(visibleCards) {
            defaults.set(data, forKey: Constants.Keys.visibleCards)
        }
        defaults.set(cardOrder, forKey: Constants.Keys.cardOrder)
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
        // App is RaceBox-only — phone GPS samples are dropped by GPSViewModel
        // before they reach this method, so this is always "racebox".
        lapTracker.gpsSource = "racebox"
        lapTracker.processSample(sample)
    }

    var orderedVisibleCards: [DriverCard] {
        cardOrder.compactMap { key in
            guard visibleCards[key] == true else { return nil }
            return DriverCard(rawValue: key)
        }
    }
}
