package com.boxboxnow.app.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.boxboxnow.app.models.KartState
import com.boxboxnow.app.models.PitStatus
import com.boxboxnow.app.models.SectorBest
import com.boxboxnow.app.models.SectorMeta
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
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
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

    private val _teamDriversCount = MutableStateFlow(0)
    val teamDriversCount = _teamDriversCount.asStateFlow()

    /** Pit-gate decision pushed by the backend (snapshot / analytics /
     *  fifo_update). Combines regulation windows, stint-length bounds
     *  AND driver-min-time feasibility into a single is_open/closed
     *  verdict + reason. Null while the very first WS frame hasn't
     *  arrived yet — driver-view falls back to the legacy local check. */
    private val _pitStatus = MutableStateFlow<PitStatus?>(null)
    val pitStatus = _pitStatus.asStateFlow()

    /** Whether the active session's Apex grid declares sector columns
     *  (s1|s2|s3 data-types). Set true the first time we see a sector
     *  payload from the backend in this session. The driver-view
     *  sector cards check this flag to decide whether to render
     *  data or a "--" stub. */
    private val _hasSectors = MutableStateFlow(false)
    val hasSectors = _hasSectors.asStateFlow()

    /** Field-wide leader per sector (kart number + driver/team + bestMs
     *  + 2nd best). Backend recomputes on every sector event and
     *  bundles in snapshot/analytics frames + on update messages
     *  whose batch contained a sector event. Null on circuits
     *  without sector telemetry. */
    private val _sectorMeta = MutableStateFlow<SectorMeta?>(null)
    val sectorMeta = _sectorMeta.asStateFlow()

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

    /** Raw Apex live timing position (kart.position straight from the
     *  grid `data-type="rk"` column), distinct from [racePosition]
     *  which orders by avg-lap pace. Returns `(pos, total)` where
     *  total is the count of karts that have a position assigned. */
    fun apexPosition(): RacePosition? {
        val ourKart = _ourKartNumber.value
        if (ourKart <= 0 || _karts.value.isEmpty()) return null
        val withPos = _karts.value.filter { it.position > 0 }
        val kart = withPos.firstOrNull { it.kartNumber == ourKart } ?: return null
        return RacePosition(kart.position, withPos.size)
    }

    /** Returns the kart at `offset` from our kart in the Apex live
     *  timing order. offset=-1 is the kart immediately ahead, +1 the
     *  kart immediately behind. `null` when our kart isn't placed yet
     *  or the requested neighbor doesn't exist (e.g. ahead of leader). */
    fun apexNeighbor(offset: Int): KartState? {
        val ourKart = _ourKartNumber.value
        if (ourKart <= 0 || _karts.value.isEmpty()) return null
        val sorted = _karts.value.filter { it.position > 0 }.sortedBy { it.position }
        val idx = sorted.indexOfFirst { it.kartNumber == ourKart }
        if (idx < 0) return null
        return sorted.getOrNull(idx + offset)
    }

    /** Format an Apex `interval` string for the driver dashboard.
     *  Apex sends three shapes:
     *   - "0.659" → numeric seconds → render as "0.659s"
     *   - "1:05.279" → m:ss.fff time → render as-is
     *   - "1 Tour" / "1L" → laps-down marker → render as-is
     *  Empty / null falls back to [leaderSentinel] (callers pick "LIDER"
     *  for the front-card path or "—" for the rear-card path). */
    fun formatApexInterval(raw: String?, leaderSentinel: String = "LIDER"): String {
        val s = (raw ?: "").trim()
        if (s.isEmpty()) return leaderSentinel
        return if (s.toDoubleOrNull() != null) "${s}s" else s
    }

    /** Result of computing the sector delta vs the field-best for a
     *  given sector. `deltaMs` is signed: negative when the local
     *  pilot leads the sector (myBest − secondBest), positive when
     *  trailing (myCurrent − fieldBest). `isMine` flags the leader
     *  case so the renderer can pick the right color/sign label
     *  without re-running the same comparison. */
    data class SectorDelta(val deltaMs: Double, val isMine: Boolean)

    /** Pure cálculo del delta vs field-best para un sector concreto.
     *  Centralizado para que las cards individuales (DeltaBestS1/2/3)
     *  y la card combinada (DeltaSectors, 3 líneas en una sola
     *  tarjeta) compartan la fórmula sin duplicación. Devuelve `null`
     *  cuando no hay datos suficientes (sectores no expuestos en el
     *  circuito, kart no localizado, sin field-best aún o sin valor
     *  del piloto local para ese sector). */
    fun sectorDelta(sectorIdx: Int): SectorDelta? {
        if (!_hasSectors.value) return null
        val ourKart = _ourKartNumber.value
        if (ourKart <= 0) return null
        val leader = _sectorMeta.value?.bestFor(sectorIdx) ?: return null
        val kart = _karts.value.firstOrNull { it.kartNumber == ourKart } ?: return null

        val (myCurrent, myBest) = when (sectorIdx) {
            1 -> kart.currentS1Ms to kart.bestS1Ms
            2 -> kart.currentS2Ms to kart.bestS2Ms
            3 -> kart.currentS3Ms to kart.bestS3Ms
            else -> return null
        }

        val isMine = kart.kartNumber == leader.kartNumber
        return if (isMine) {
            val mb = myBest
            val sb = leader.secondBestMs
            // Margin off MY best (stable). Without runner-up, render 0.
            val d = if (mb != null && mb > 0 && sb != null && sb > 0) mb - sb else 0.0
            SectorDelta(d, isMine = true)
        } else {
            // Deficit uses CURRENT (latest pass) so the value reacts to
            // each sector crossing.
            if (myCurrent != null && myCurrent > 0) SectorDelta(myCurrent - leader.bestMs, isMine = false)
            else null
        }
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
                    cfg["teamDriversCount"]?.asIntOrNull()?.let { _teamDriversCount.value = it }
                }

                (data["fifo"] as? JsonObject)?.get("score")?.asDoubleOrNull()?.let { _boxScore.value = it }

                // Sector telemetry. CRITICAL: only overwrite when the
                // keys are actually present in the payload — older
                // backends (and edge cases like a cluster-only broadcast
                // that doesn't bundle sectors) would otherwise reset
                // hasSectors → false between every analytics tick,
                // making the driver-view sector cards flicker to "--"
                // every ~10-30s. Genuine clears come through
                // `hasSectors: false` explicitly, which is what the
                // backend sends on session change.
                if (data.containsKey("hasSectors")) {
                    _hasSectors.value = data["hasSectors"]?.asBoolOrNull() ?: false
                }
                if (data.containsKey("sectorMeta")) {
                    _sectorMeta.value = parseSectorMeta(data["sectorMeta"])
                }
                // Pit-gate decision pushed by backend. Same defensive
                // containsKey check as sectors — analytics frames from
                // older backends omit the field, and we must not reset
                // the cached state in that case.
                if (data.containsKey("pitStatus")) {
                    _pitStatus.value = parsePitStatus(data["pitStatus"])
                }
            }

            "update" -> {
                (el["events"] as? JsonArray)?.forEach { evt ->
                    (evt as? JsonObject)?.let { applyUpdateEvent(it) }
                }
                el["countdownMs"]?.asDoubleOrNull()?.let { recalibrate(it) }
                // Backend bundles a fresh sectorMeta + hasSectors at the
                // top level of update messages whose batch contained a
                // sector event (skipped otherwise to save bandwidth).
                // Same defensive containsKey check as above so unrelated
                // updates don't wipe cached state.
                if (el.containsKey("hasSectors")) {
                    _hasSectors.value = el["hasSectors"]?.asBoolOrNull() ?: false
                }
                if (el.containsKey("sectorMeta")) {
                    _sectorMeta.value = parseSectorMeta(el["sectorMeta"])
                }
            }

            "fifo_update" -> {
                val data = el["data"] as? JsonObject
                data?.get("fifo")?.jsonObject?.get("score")
                    ?.asDoubleOrNull()?.let { _boxScore.value = it }
                // Backend bundles the recomputed pit-gate state on every
                // fifo_update so the badge reacts immediately to a pit-in
                // shifting driver totals.
                if (data?.containsKey("pitStatus") == true) {
                    _pitStatus.value = parsePitStatus(data["pitStatus"])
                }
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
            "pitIn" -> {
                // Newer backends include pitInCountdownMs in the pitIn event.
                // Fall back to the currently-interpolated countdown so older
                // backends still get a working pit timer.
                val pitInCd = evt["pitInCountdownMs"]?.asDoubleOrNull()
                    ?: interpolatedClockMs().takeIf { it > 0 }
                    ?: k.pitInCountdownMs
                k.copy(
                    pitStatus = "in_pit",
                    pitCount = evt["pitCount"]?.asIntOrNull() ?: k.pitCount,
                    pitInCountdownMs = pitInCd,
                )
            }
            "pitOut" -> k.copy(
                pitStatus = "racing",
                pitCount = evt["pitCount"]?.asIntOrNull() ?: k.pitCount,
                stintStartCountdownMs = evt["stintStartCountdownMs"]?.asDoubleOrNull() ?: k.stintStartCountdownMs,
                pitInCountdownMs = null,
                stintElapsedMs = 0.0,
            )
            "driver" -> k.copy(driverName = evt["driverName"]?.jsonPrimitive?.contentOrNull ?: k.driverName)
            "team" -> k.copy(teamName = evt["teamName"]?.jsonPrimitive?.contentOrNull ?: k.teamName)
            "sector" -> {
                // Per-kart sector update. Backend also bundles a fresh
                // sectorMeta at the top level of the same update message
                // (handled in handleMessage) — this branch only updates
                // the kart's own currentSnMs / bestSnMs so the live
                // "Δ vs field-best" card reflects the latest sector
                // pass for this specific pilot. sectorIdx is 1, 2 or 3
                // — the SECTOR index, resolved by the backend from the
                // grid's data-type, never from the cN column index.
                val sectorIdx = evt["sectorIdx"]?.asIntOrNull()
                val ms = evt["ms"]?.asDoubleOrNull()
                if (sectorIdx == null || ms == null || ms <= 0.0) {
                    k
                } else when (sectorIdx) {
                    1 -> k.copy(
                        currentS1Ms = ms,
                        bestS1Ms = if (k.bestS1Ms == null || ms < k.bestS1Ms) ms else k.bestS1Ms,
                    )
                    2 -> k.copy(
                        currentS2Ms = ms,
                        bestS2Ms = if (k.bestS2Ms == null || ms < k.bestS2Ms) ms else k.bestS2Ms,
                    )
                    3 -> k.copy(
                        currentS3Ms = ms,
                        bestS3Ms = if (k.bestS3Ms == null || ms < k.bestS3Ms) ms else k.bestS3Ms,
                    )
                    else -> k
                }
            }
            else -> k
        }
        current[idx] = updated
        _karts.value = current
    }

    /** Decode the `sectorMeta` payload (top-level field on snapshots,
     *  analytics frames and on update messages whose batch contained a
     *  sector event) into a strongly-typed `SectorMeta`. Returns null
     *  when the backend reports `null` (circuit without sectors) or
     *  the payload is malformed. */
    private fun parseSectorMeta(el: JsonElement?): SectorMeta? {
        val obj = el as? JsonObject ?: return null
        fun decode(key: String): SectorBest? {
            val inner = obj[key] as? JsonObject ?: return null
            val bestMs = inner["bestMs"]?.asDoubleOrNull() ?: return null
            val kartNumber = inner["kartNumber"]?.asIntOrNull() ?: return null
            return SectorBest(
                bestMs = bestMs,
                kartNumber = kartNumber,
                driverName = inner["driverName"]?.jsonPrimitive?.contentOrNull,
                teamName = inner["teamName"]?.jsonPrimitive?.contentOrNull,
                secondBestMs = inner["secondBestMs"]?.asDoubleOrNull(),
            )
        }
        val s1 = decode("s1")
        val s2 = decode("s2")
        val s3 = decode("s3")
        if (s1 == null && s2 == null && s3 == null) return null
        return SectorMeta(s1, s2, s3)
    }

    /** Decode the `pitStatus` payload (top-level field on snapshots,
     *  analytics frames and fifo_update messages) into a strongly-typed
     *  `PitStatus`. Returns null when the backend reports `null` or the
     *  payload is malformed; callers fall back to the prior local pit-
     *  window heuristic in that case. */
    private fun parsePitStatus(el: JsonElement?): PitStatus? {
        val obj = el as? JsonObject ?: return null
        val isOpen = obj["is_open"]?.asBoolOrNull() ?: true
        val closeReason = obj["close_reason"]?.jsonPrimitive?.contentOrNull
        val blockingDriver = obj["blocking_driver"]?.jsonPrimitive?.contentOrNull
        val blockingRem = obj["blocking_driver_remaining_ms"]?.asLongOrNull()
        val nextOpen = obj["next_open_countdown_ms"]?.asLongOrNull()
        val driversArr = obj["drivers"] as? JsonArray
        val drivers = driversArr?.mapNotNull { it as? JsonObject }?.map { d ->
            PitStatus.DriverTimeInfo(
                name = d["name"]?.jsonPrimitive?.contentOrNull ?: "",
                accumulatedMs = d["accumulated_ms"]?.asLongOrNull() ?: 0L,
                remainingMs = d["remaining_ms"]?.asLongOrNull() ?: 0L,
            )
        }
        return PitStatus(
            isOpen = isOpen,
            closeReason = closeReason,
            blockingDriver = blockingDriver,
            blockingDriverRemainingMs = blockingRem,
            nextOpenCountdownMs = nextOpen,
            drivers = drivers,
        )
    }
}

// ── JSON helpers ──

private fun JsonElement.asDoubleOrNull(): Double? = runCatching {
    jsonPrimitive.doubleOrNull ?: jsonPrimitive.intOrNull?.toDouble()
}.getOrNull()

private fun JsonElement.asIntOrNull(): Int? = runCatching {
    jsonPrimitive.intOrNull ?: jsonPrimitive.doubleOrNull?.toInt()
}.getOrNull()

private fun JsonElement.asLongOrNull(): Long? = runCatching {
    jsonPrimitive.longOrNull
        ?: jsonPrimitive.intOrNull?.toLong()
        ?: jsonPrimitive.doubleOrNull?.toLong()
}.getOrNull()

private fun JsonElement.asBoolOrNull(): Boolean? = runCatching {
    jsonPrimitive.booleanOrNull
}.getOrNull()
