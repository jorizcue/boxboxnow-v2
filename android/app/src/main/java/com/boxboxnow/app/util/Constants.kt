package com.boxboxnow.app.util

object Constants {
    const val API_BASE_URL = "https://boxboxnow.com/api"
    const val WS_BASE_URL = "wss://boxboxnow.com/ws"

    const val MAX_PRESETS = 10
    const val GPS_SAMPLE_RATE_S = 0.1 // 10 Hz

    object Ble {
        // Nordic UART service used by RaceBox Mini
        const val UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
        const val UART_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
        const val UART_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
        const val CCCD_UUID = "00002902-0000-1000-8000-00805f9b34fb"
    }

    object Keys {
        const val VISIBLE_CARDS = "driver_visible_cards"
        const val CARD_ORDER = "driver_card_order"
        const val GPS_SOURCE = "gps_source"
        const val CIRCUIT_ID = "circuit_id"
        const val SESSION_NAME = "session_name"
        const val ORIENTATION = "orientation_lock"
        const val BRIGHTNESS = "driver_brightness"
        const val AUDIO_ENABLED = "driver_audio_enabled"
        const val FINISH_LINE = "bbn_finish_line"
    }
}
