package com.boxboxnow.app.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.boxboxnow.app.ble.BleManager
import com.boxboxnow.app.ble.UbxParser
import com.boxboxnow.app.gps.PhoneGpsManager
import com.boxboxnow.app.imu.ImuCalibrator
import com.boxboxnow.app.models.GPSSample
import com.boxboxnow.app.store.PreferencesStore
import com.boxboxnow.app.util.Constants
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

enum class GpsSource(val raw: String, val display: String) {
    NONE("none", "Ninguno"),
    PHONE("phone", "Telefono"),    // legacy — never selectable, kept for migration
    RACEBOX("racebox", "RaceBox BLE");

    companion object {
        fun from(raw: String?) = entries.firstOrNull { it.raw == raw } ?: NONE

        /** Sources the user is allowed to pick from the UI. PHONE is hidden
         *  because the project requires RaceBox-only telemetry. */
        val selectable: List<GpsSource> = listOf(NONE, RACEBOX)
    }
}

enum class SignalQuality(val display: String) {
    NONE("Sin senal"),
    POOR("Debil"),
    FAIR("Aceptable"),
    GOOD("Buena"),
    EXCELLENT("Excelente");
}

@HiltViewModel
class GpsViewModel @Inject constructor(
    val bleManager: BleManager,
    val phoneGps: PhoneGpsManager,
    private val prefs: PreferencesStore,
) : ViewModel() {
    private val _source = MutableStateFlow(GpsSource.NONE)
    val source = _source.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    val isConnected = _isConnected.asStateFlow()

    private val _signalQuality = MutableStateFlow(SignalQuality.NONE)
    val signalQuality = _signalQuality.asStateFlow()

    private val _sampleRate = MutableStateFlow(0.0)
    val sampleRate = _sampleRate.asStateFlow()

    private val _lastSample = MutableStateFlow<GPSSample?>(null)
    val lastSample = _lastSample.asStateFlow()

    val calibrator = ImuCalibrator()
    private val ubxParser = UbxParser()

    /** Downstream hook — DriverViewModel plugs into this to feed LapTracker. */
    var onSample: ((GPSSample) -> Unit)? = null

    private var lastSampleAt: Double = 0.0
    private var sampleCount: Int = 0

    init {
        bleManager.onData = { data -> ubxParser.feed(data) }
        ubxParser.onParsed = { sample -> handleSample(sample) }
        // PhoneGps wire-up intentionally removed: the project is RaceBox-only.
        // Leaving phoneGps.onSample disconnected guarantees that even if any
        // legacy code path calls phoneGps.start(), its samples can never
        // reach the LapTracker.

        // Force RaceBox on every launch — ignore any saved preference
        // (an older build may have stored "phone" in prefs).
        _source.value = GpsSource.RACEBOX
        prefs.putString(Constants.Keys.GPS_SOURCE, GpsSource.RACEBOX.raw)
    }

    fun selectSource(src: GpsSource) {
        // App is RaceBox-only. Reject PHONE requests (legacy preference,
        // UI shouldn't expose it anyway).
        val resolved = if (src == GpsSource.PHONE) GpsSource.RACEBOX else src
        stopGps()
        _source.value = resolved
        prefs.putString(Constants.Keys.GPS_SOURCE, resolved.raw)
        if (resolved != GpsSource.NONE) startGps()
    }

    fun startGps() {
        when (_source.value) {
            GpsSource.NONE -> Unit
            GpsSource.PHONE -> {
                // Defensive no-op: phone GPS is never used. If the saved
                // preference is somehow PHONE, treat it as RACEBOX.
                _source.value = GpsSource.RACEBOX
                bleManager.startScan()
            }
            GpsSource.RACEBOX -> bleManager.startScan()
        }
    }

    fun stopGps() {
        phoneGps.stop()
        bleManager.disconnect()
        bleManager.stopScan()
        _isConnected.value = false
        _signalQuality.value = SignalQuality.NONE
    }

    private fun handleSample(raw: GPSSample) {
        // RaceBox-only guard. RaceBox samples carry batteryPercent; the
        // PhoneGpsManager always emits null. If a phone sample sneaks in
        // via some unintended path, drop it before it reaches LapTracker.
        if (raw.batteryPercent == null) return

        val calibrated = calibrator.calibrate(raw)
        _lastSample.value = calibrated
        _isConnected.value = true

        _signalQuality.value = when (calibrated.numSatellites) {
            0 -> SignalQuality.NONE
            in 1..4 -> SignalQuality.POOR
            in 5..7 -> SignalQuality.FAIR
            in 8..11 -> SignalQuality.GOOD
            else -> SignalQuality.EXCELLENT
        }

        // Simple sample-rate gauge: samples/sec windowed over 2s
        val now = android.os.SystemClock.elapsedRealtime() / 1000.0
        if (now - lastSampleAt < 2) {
            sampleCount++
        } else {
            _sampleRate.value = sampleCount.toDouble()
            sampleCount = 0
        }
        lastSampleAt = now

        onSample?.invoke(calibrated)
    }
}
