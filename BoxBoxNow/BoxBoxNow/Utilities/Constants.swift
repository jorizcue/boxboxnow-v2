import Foundation

enum Constants {
    #if DEBUG
    static let apiBaseURL = "https://bbn.boxboxnow.kartingnow.com/api"
    static let wsBaseURL  = "wss://bbn.boxboxnow.kartingnow.com/ws"
    #else
    static let apiBaseURL = "https://bbn.boxboxnow.kartingnow.com/api"
    static let wsBaseURL  = "wss://bbn.boxboxnow.kartingnow.com/ws"
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
    }
}
