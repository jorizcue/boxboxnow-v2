package com.boxboxnow.app.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.boxboxnow.app.models.KartState
import com.boxboxnow.app.net.WebSocketClient
import com.boxboxnow.app.store.SecureTokenStore
import com.boxboxnow.app.util.Constants
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

/**
 * Matches iOS RaceViewModel: parses WS snapshots/updates, keeps karts + race
 * clock in sync, exposes derived calculations (stable speed, real position,
 * pit window, stint calc). Uses kotlinx.serialization's JsonElement tree for
 * event parsing since events have polymorphic shapes.
 */
@HiltViewModel
class RaceViewModel @Inject constructor(
    private val ws: WebSocketClient,
    private val tokenStore: SecureTokenStore,
) : ViewModel() {
    val isConnected = ws.isConnected

    private val _karts = MutableStateFlow<List<KartState>>(emptyList())
    val karts = _karts.asStateFlow()

    private val _raceTimerMs = MutableStateFlow(0.0)
    val raceTimerMs = _raceTimerMs.asStateFlow()

    private val _countdownMs = MutableStateFlow(0.0)
    val countdownMs = _countdownMs.asStateFlow()

    private val _raceStarted = MutableStateFlow(false)
    val raceStarted = _raceStarted.asStateFlow()

    private val _raceFinished = MutableStateFlow(false)
    val raceFinished = _raceFinished.asStateFlow()

    private val _replayActive = MutableStateFlow(false)
    val replayActive = _replayActive.asStateFlow()

    private val _boxCallActive = MutableStateFlow(false)
    val boxCallActive = _boxCallActive.asStateFlow()

    /** Emits the circuit_id every time the backend notifies a live admin
     * edit of the circuit (e.g. new GPS finish-line). DriverScreen
     * collects it to re-fetch circuits + re-apply the finish line on
     * the fly. Kept as a SharedFlow (one-shot event) so late collectors
     * don't trigger on a stale update. */
    private val _circuitUpdatedEvents = MutableSharedFlow<Int>(extraBufferCapacity = 4)
    val circuitUpdatedEvents = _circuitUpdatedEvents.asSharedFlow()

    private val _boxScore = MutableStateFlow(0.0)
    val boxScore = _boxScore.asStateFlow()

    private val _sessionName = MutableStateFlow("")
    val sessionName = _sessionName.asStateFlow()

    private val _durationMs = MutableStateFlow(0.0)
    val durationMs = _durationMs.asStateFlow()

    // Race config (live-updated from snapshots)
    private val _ourKartNumber = MutableStateFlow(0)
    val ourKartNumber = _ourKartNumber.asStateFlow()

    private val _circuitLengthM = MutableStateFlow(1100.0)
    val circuitLengthM = _circuitLengthM.asStateFlow()

    private val _pitTimeS = MutableStateFlow(0.0)
    val pitTimeS = _pitTimeS.asStateFlow()

    private val _durationMin = MutableStateFlow(0.0)
    val durationMin = _durationMin.asStateFlow()

    private val _minPits = MutableStateFlow(0)
    val minPits = _minPits.asStateFlow()

    private val _maxStintMin = MutableStateFlow(0.0)
    val maxStintMin = _maxStintMin.asStateFlow()

    private val _minStintMin = MutableStateFlow(0.0)
    val minStintMin = _minStintMin.asStateFlow()

    private val _minDriverTimeMin = MutableStateFlow(0.0)
    val minDriverTimeMin = _minDriverTimeMin.asStateFlow()

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    // Server clock reference: the last value + wallclock when it arrived.
    @Volatile private var serverCountdownMs: Double = 0.0
    @Volatile private var serverCountdownAt: Long = 0

    fun setOurKartNumber(v: Int) { _ourKartNumber.value = v }
    fun clearBoxCall() { _boxCallActive.value = false }

    init {
        ws.onMessage = { text -> handleMessage(text) }
        // After every (re)connect, ask the backend for a full snapshot so the
        // cached karts/config don't go stale after a network blip.
        ws.onConnected = { requestSnapshot() }
    }

    fun connect() {
        val token = tokenStore.loadToken()
        if (token == null) return
        val url = "${Constants.WS_BASE_URL}/race?token=$token&device=mobile&view=driver"
        ws.connectToUrl(url)
    }

    fun disconnect() = ws.disconnect()

    fun requestSnapshot() {
        ws.send("{\"type\":\"requestSnapshot\"}")
    }

    /** Interpolate the race clock smoothly — called from the UI every tick. */
    fun interpolatedClockMs(nowMs: Long = System.currentTimeMillis()): Double {
        if (serverCountdownMs <= 0 || _raceFinished.value) return 0.0
        val wallElapsed = (nowMs - serverCountdownAt).toDouble()
        return maxOf(0.0, serverCountdownMs - wallElapsed)
    }

    // ── Derived calculations (mirror iOS / web) ──

    fun stableSpeedMs(k: KartState): Double {
        val avg = k.avgLapMs ?: return 0.0
        if (avg <= 0) return 0.0
        val last = k.lastLapMs
        if (last != null && last > 0) {
            val ratio = last / avg
            if (ratio in 0.85..1.15) {
                val blended = avg * 0.7 + last * 0.3
                return _circuitLengthM.value / (blended / 1000)
            }
        }
        return _circuitLengthM.value / (avg / 1000)
    }

    data class OurData(
        val realPosition: Int,
        val totalKarts: Int,
        val aheadKart: KartState?,
        val behindKart: KartState?,
        val aheadSeconds: Double,
        val behindSeconds: Double,
    )

    fun computeOurData(clockMs: Double = 0.0): OurData? {
        val ourKart = _ourKartNumber.value
        if (ourKart <= 0 || _karts.value.isEmpty()) return null
        val clock = if (clockMs > 0) clockMs else _raceTimerMs.value

        data class Mapped(val kart: KartState, val speedMs: Double, val adjDist: Double)

        val circuitLen = _circuitLengthM.value
        val pitTime = _pitTimeS.value
        val minPitsV = _minPits.value

        val mapped = _karts.value
            .filter { it.totalLaps > 0 }
            .map { k ->
                val speedMs = stableSpeedMs(k)
                val baseDist = k.totalLaps * circuitLen
                var extra = 0.0
                if (k.pitStatus == "racing" && speedMs > 0) {
                    val stintStart = k.stintStartCountdownMs
                    if (stintStart != null && stintStart > 0 && clock != 0.0) {
                        val stintTimeMs = stintStart - clock
                        val sinceCrossMs = stintTimeMs - (k.stintElapsedMs ?: 0.0)
                        if (sinceCrossMs > 0) extra = (sinceCrossMs / 1000) * speedMs
                    }
                    if (extra > circuitLen * 0.95) extra = circuitLen * 0.95
                }
                val total = baseDist + extra
                val missing = maxOf(0, minPitsV - k.pitCount).toDouble()
                val penalty = missing * speedMs * pitTime
                Mapped(k, speedMs, total - penalty)
            }
            .sortedByDescending { it.adjDist }

        val ourIdx = mapped.indexOfFirst { it.kart.kartNumber == ourKart }
        if (ourIdx < 0) return null
        val our = mapped[ourIdx]
        val ahead = if (ourIdx > 0) mapped[ourIdx - 1] else null
        val behind = if (ourIdx < mapped.size - 1) mapped[ourIdx + 1] else null

        val aheadDiff = ahead?.let { it.adjDist - our.adjDist } ?: 0.0
        val aheadTime = if (our.speedMs > 0) aheadDiff / our.speedMs else 0.0
        val behindDiff = behind?.let { our.adjDist - it.adjDist } ?: 0.0
        val behindTime = if (behind != null && behind.speedMs > 0) behindDiff / behind.speedMs else 0.0

        return OurData(
            realPosition = ourIdx + 1,
            totalKarts = mapped.size,
            aheadKart = ahead?.kart,
            behindKart = behind?.kart,
            aheadSeconds = aheadTime,
            behindSeconds = behindTime,
        )
    }

    data class RacePosition(val pos: Int, val total: Int)
    fun racePosition(): RacePosition? {
        val ourKart = _ourKartNumber.value
        if (ourKart <= 0 || _karts.value.isEmpty()) return null
        val sorted = _karts.value
            .filter { (it.avgLapMs ?: 0.0) > 0 }
            .sortedBy { it.avgLapMs ?: Double.POSITIVE_INFINITY }
        val idx = sorted.indexOfFirst { it.kartNumber == ourKart }
        return if (idx < 0) null else RacePosition(idx + 1, sorted.size)
    }

    data class StintCalc(val lapsToMax: Double?, val realMaxStintMin: Double?)

    fun computeStintCalc(clockMs: Double = 0.0): StintCalc {
        val clock = if (clockMs > 0) clockMs else _raceTimerMs.value
        val ourKart = _ourKartNumber.value
        if (ourKart <= 0 || clock <= 0 || _raceFinished.value) return StintCalc(null, null)
        val kart = _karts.value.firstOrNull { it.kartNumber == ourKart } ?: return StintCalc(null, null)
        val avgLap = kart.avgLapMs ?: return StintCalc(null, null)
        if (avgLap <= 0) return StintCalc(null, null)

        val stintStart = kart.stintStartCountdownMs ?: (_durationMs.value.takeIf { it > 0 } ?: clock)
        val stintSec = maxOf(0.0, stintStart - clock) / 1000
        val timeRemainingMin = stintStart / 1000 / 60
        val pendingPits = maxOf(0, _minPits.value - kart.pitCount)
        val reserveMin = if (pendingPits > 0) (_pitTimeS.value / 60 + _minStintMin.value) * pendingPits else 0.0
        val availableMin = timeRemainingMin - reserveMin
        val realMax = minOf(_maxStintMin.value, maxOf(0.0, availableMin))
        val timeToMaxSec = maxOf(0.0, realMax * 60 - stintSec)
        val laps = timeToMaxSec / (avgLap / 1000)
        return StintCalc(laps, realMax)
    }

    // ── WebSocket handling ──

    private fun handleMessage(text: String) {
        val el = runCatching { json.parseToJsonElement(text) }.getOrNull() as? JsonObject ?: return
        val type = el["type"]?.jsonPrimitive?.contentOrNull ?: return
        when (type) {
            "snapshot", "analytics" -> {
                val data = el["data"] as? JsonObject ?: return
                (data["karts"] as? JsonArray)?.let { parseKarts(it) }
                data["raceStarted"]?.asBoolOrNull()?.let { _raceStarted.value = it }
                data["raceFinished"]?.asBoolOrNull()?.let { _raceFinished.value = it }
                data["durationMs"]?.asDoubleOrNull()?.let {
                    _durationMs.value = it
                    if (_raceTimerMs.value == 0.0) recalibrate(it)
                }
                data["trackName"]?.jsonPrimitive?.contentOrNull?.let { _sessionName.value = it }
                data["countdownMs"]?.asDoubleOrNull()?.let { recalibrate(it) }

                (data["config"] as? JsonObject)?.let { cfg ->
                    cfg["ourKartNumber"]?.asIntOrNull()?.let { _ourKartNumber.value = it }
                    cfg["circuitLengthM"]?.asDoubleOrNull()?.let { _circuitLengthM.value = it }
                    cfg["pitTimeS"]?.asDoubleOrNull()?.let { _pitTimeS.value = it }
                    cfg["durationMin"]?.asDoubleOrNull()?.let { _durationMin.value = it }
                    cfg["minPits"]?.asIntOrNull()?.let { _minPits.value = it }
                    cfg["maxStintMin"]?.asDoubleOrNull()?.let { _maxStintMin.value = it }
                    cfg["minStintMin"]?.asDoubleOrNull()?.let { _minStintMin.value = it }
                    cfg["minDriverTimeMin"]?.asDoubleOrNull()?.let { _minDriverTimeMin.value = it }
                }

                (data["fifo"] as? JsonObject)?.get("score")?.asDoubleOrNull()?.let { _boxScore.value = it }
            }

            "update" -> {
                (el["events"] as? JsonArray)?.forEach { evt ->
                    (evt as? JsonObject)?.let { applyUpdateEvent(it) }
                }
                el["countdownMs"]?.asDoubleOrNull()?.let { recalibrate(it) }
            }

            "fifo_update" -> {
                (el["data"] as? JsonObject)?.get("fifo")?.jsonObject?.get("score")
                    ?.asDoubleOrNull()?.let { _boxScore.value = it }
            }

            "replay_status" -> {
                val active = (el["data"] as? JsonObject)?.get("active")?.asBoolOrNull() ?: false
                if (active != _replayActive.value) {
                    _replayActive.value = active
                    requestSnapshot()
                }
            }

            "box_call" -> { _boxCallActive.value = true }

            "circuit_updated" -> {
                // Admin edited the circuit's GPS finish-line. Broadcast
                // on the SharedFlow so DriverScreen can re-fetch circuits
                // and re-apply the finish line. We don't update state
                // here — the circuits list lives on ConfigViewModel.
                val cid = (el["data"] as? JsonObject)
                    ?.get("circuit_id")?.asIntOrNull() ?: -1
                _circuitUpdatedEvents.tryEmit(cid)
            }
        }
    }

    private fun parseKarts(arr: JsonArray) {
        runCatching {
            val parsed = arr.map { json.decodeFromJsonElement(KartState.serializer(), it) }
            _karts.value = parsed.sortedBy { it.position }
        }
    }

    private fun recalibrate(serverMs: Double) {
        serverCountdownMs = serverMs
        serverCountdownAt = System.currentTimeMillis()
        _countdownMs.value = serverMs
        _raceTimerMs.value = serverMs
    }

    private fun applyUpdateEvent(evt: JsonObject) {
        val event = evt["event"]?.jsonPrimitive?.contentOrNull ?: return
        when (event) {
            "countdown" -> { evt["ms"]?.asDoubleOrNull()?.let { recalibrate(it) }; return }
            "raceEnd" -> {
                _raceFinished.value = true
                _raceTimerMs.value = 0.0
                _countdownMs.value = 0.0
                return
            }
            "track" -> {
                evt["name"]?.jsonPrimitive?.contentOrNull?.let { _sessionName.value = it }
                evt["circuitLengthM"]?.asDoubleOrNull()?.let { _circuitLengthM.value = it }
                return
            }
        }

        val current = _karts.value.toMutableList()
        val kartNumber = evt["kartNumber"]?.asIntOrNull()
        val rowId = evt["rowId"]?.jsonPrimitive?.contentOrNull
        val idx = when {
            kartNumber != null -> current.indexOfFirst { it.kartNumber == kartNumber }
            rowId != null -> current.indexOfFirst { it.rowId == rowId }
            else -> -1
        }
        if (idx < 0) return
        val k = current[idx]

        val updated: KartState = when (event) {
            "lap" -> {
                val lap = evt["lapTimeMs"]?.asDoubleOrNull()
                val total = evt["totalLaps"]?.asIntOrNull()
                k.copy(
                    lastLapMs = lap ?: k.lastLapMs,
                    bestLapMs = if (lap != null && (k.bestLapMs == null || lap < k.bestLapMs)) lap else k.bestLapMs,
                    totalLaps = total ?: (k.totalLaps + 1),
                )
            }
            "bestLap" -> k.copy(bestLapMs = evt["lapTimeMs"]?.asDoubleOrNull() ?: k.bestLapMs)
            "position" -> k.copy(position = evt["position"]?.asIntOrNull() ?: k.position)
            "gap" -> k.copy(gap = evt["value"]?.jsonPrimitive?.contentOrNull ?: k.gap)
            "interval" -> k.copy(interval = evt["value"]?.jsonPrimitive?.contentOrNull ?: k.interval)
            "totalLaps" -> k.copy(totalLaps = evt["value"]?.asIntOrNull() ?: k.totalLaps)
            "pitCount" -> k.copy(pitCount = evt["value"]?.asIntOrNull() ?: k.pitCount)
            "pitIn" -> k.copy(
                pitStatus = "in_pit",
                pitCount = evt["pitCount"]?.asIntOrNull() ?: k.pitCount,
            )
            "pitOut" -> k.copy(
                pitStatus = "racing",
                pitCount = evt["pitCount"]?.asIntOrNull() ?: k.pitCount,
                stintStartCountdownMs = evt["stintStartCountdownMs"]?.asDoubleOrNull() ?: k.stintStartCountdownMs,
                stintElapsedMs = 0.0,
            )
            "driver" -> k.copy(driverName = evt["driverName"]?.jsonPrimitive?.contentOrNull ?: k.driverName)
            "team" -> k.copy(teamName = evt["teamName"]?.jsonPrimitive?.contentOrNull ?: k.teamName)
            else -> k
        }
        current[idx] = updated
        _karts.value = current
    }
}

// ── JSON helpers ──

private fun JsonElement.asDoubleOrNull(): Double? = runCatching {
    jsonPrimitive.doubleOrNull ?: jsonPrimitive.intOrNull?.toDouble()
}.getOrNull()

private fun JsonElement.asIntOrNull(): Int? = runCatching {
    jsonPrimitive.intOrNull ?: jsonPrimitive.doubleOrNull?.toInt()
}.getOrNull()

private fun JsonElement.asBoolOrNull(): Boolean? = runCatching {
    jsonPrimitive.booleanOrNull
}.getOrNull()
