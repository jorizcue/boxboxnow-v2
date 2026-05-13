import Foundation

enum Constants {
    #if DEBUG
    static let apiBaseURL = "https://boxboxnow.com/api"
    static let wsBaseURL  = "wss://boxboxnow.com/ws"
    #else
    static let apiBaseURL = "https://boxboxnow.com/api"
    static let wsBaseURL  = "wss://boxboxnow.com/ws"
    #endif

    static let maxPresets = 10
    static let gpsSampleRate: TimeInterval = 0.1 // 10 Hz

    enum BLE {
        static let uartServiceUUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
        static let uartTxCharUUID  = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
        static let uartRxCharUUID  = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
    }

    enum Keys {
        static let visibleCards = "driver_visible_cards"
        static let cardOrder    = "driver_card_order"
        static let gpsSource    = "gps_source"
        static let circuitId    = "circuit_id"
        static let sessionName  = "session_name"
        static let orientation  = "orientation_lock"
        static let brightness   = "driver_brightness"
        static let audioEnabled = "driver_audio_enabled"
        // Refresh rate (in Hz) for the GPS delta cards on the driver
        // dashboard. Underlying `lapTracker.deltaBestMs/deltaPrevMs` are
        // recomputed at the RaceBox sample rate (~50Hz); this only
        // controls how often the on-screen number changes. Allowed
        // values: 1, 2, 4.
        static let gpsDeltaRefreshHz = "gps_delta_refresh_hz"
        // Username of the last successfully-authenticated user on this
        // device. Used to detect "different user logged in" and wipe
        // per-user-scoped UserDefaults (driver config) so plantillas
        // from a previous account don't leak into the new account.
        static let lastUsername = "auth_last_username"
    }

    /// UserDefaults keys that hold per-user driver-view state. Wiped on
    /// `fullSignOut()` and when a different user logs in — without this,
    /// the cached visibleCards / cardOrder / brightness / orientation
    /// / audioEnabled survive a logout, and the next user lands on the
    /// previous user's plantilla even though they have zero presets of
    /// their own (visible bug: Vista Piloto loads with stale layout).
    static let driverConfigKeys: [String] = [
        Keys.visibleCards,
        Keys.cardOrder,
        Keys.orientation,
        Keys.brightness,
        Keys.audioEnabled,
    ]
}
