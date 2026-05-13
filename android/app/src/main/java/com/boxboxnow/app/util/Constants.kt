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
        // Refresh rate (in Hz) for the GPS delta cards on the driver
        // dashboard. The underlying deltaBestMs flow on LapTracker is
        // recomputed at the RaceBox sample rate (~50Hz); this only
        // controls how often the on-screen number changes. Allowed
        // values: 1, 2, 4. Matches iOS Constants.Keys.gpsDeltaRefreshHz.
        const val GPS_DELTA_REFRESH_HZ = "gps_delta_refresh_hz"
        // Username of the last successfully-authenticated user on this
        // device. Used to detect "different user logged in" and wipe
        // per-user driver config so plantillas from a previous account
        // don't leak into the new account.
        const val LAST_USERNAME = "auth_last_username"
    }

    /// Driver-view SharedPreferences keys that hold per-user state. Wiped
    /// on `fullSignOut()` and on account switch — without this the cached
    /// visibleCards / cardOrder / brightness / orientationLock /
    /// audioEnabled survive a logout, and the next user lands on the
    /// previous user's plantilla even though they have zero presets of
    /// their own.
    val DRIVER_CONFIG_KEYS = listOf(
        Keys.VISIBLE_CARDS,
        Keys.CARD_ORDER,
        Keys.ORIENTATION,
        Keys.BRIGHTNESS,
        Keys.AUDIO_ENABLED,
    )
}
