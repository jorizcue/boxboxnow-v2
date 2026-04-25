package com.boxboxnow.app.lap

import com.boxboxnow.app.models.FinishLine
import com.boxboxnow.app.models.GPSSample
import com.boxboxnow.app.models.GeoPoint
import com.boxboxnow.app.net.ApiClient
import com.boxboxnow.app.store.PreferencesStore
import com.boxboxnow.app.util.GeoUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json

/**
 * GPS lap tracker with finish-line crossing detection and distance-interpolated
 * delta vs best/prev lap. Matches iOS LapTracker / web useGpsTelemetrySave.
 */
class LapTracker(
    private val api: ApiClient,
    private val prefs: PreferencesStore,
    private val scope: CoroutineScope,
) {
    data class LapRecord(
        val lapNumber: Int,
        val durationMs: Double,
        val totalDistanceM: Double,
        val maxSpeedKmh: Double,
        val distances: List<Double>,
        val timestamps: List<Double>,
        val positions: List<Pair<Double, Double>>,
        val speeds: List<Double>,
        val gforceLat: List<Double>,
        val gforceLon: List<Double>,
    )

    private val _currentLap = MutableStateFlow(0)
    val currentLap = _currentLap.asStateFlow()

    private val _laps = MutableStateFlow<List<LapRecord>>(emptyList())
    val laps = _laps.asStateFlow()

    private val _bestLapMs = MutableStateFlow<Double?>(null)
    val bestLapMs = _bestLapMs.asStateFlow()

    private val _lastLapMs = MutableStateFlow<Double?>(null)
    val lastLapMs = _lastLapMs.asStateFlow()

    private val _deltaBestMs = MutableStateFlow<Double?>(null)
    val deltaBestMs = _deltaBestMs.asStateFlow()

    private val _deltaPrevMs = MutableStateFlow<Double?>(null)
    val deltaPrevMs = _deltaPrevMs.asStateFlow()

    private val _currentLapElapsedMs = MutableStateFlow(0.0)
    val currentLapElapsedMs = _currentLapElapsedMs.asStateFlow()

    private var finishLine: FinishLine? = null
    private var lapStartTime: Double? = null
    private var lastSample: GPSSample? = null
    private var lapDistanceM: Double = 0.0
    private var lapMaxSpeed: Double = 0.0

    private val curDistances = mutableListOf<Double>()
    private val curTimestamps = mutableListOf<Double>()
    private val curPositions = mutableListOf<Pair<Double, Double>>()
    private val curSpeeds = mutableListOf<Double>()
    private val curGforceLat = mutableListOf<Double>()
    private val curGforceLon = mutableListOf<Double>()

    private var bestLap: LapRecord? = null
    private var prevLap: LapRecord? = null

    // Cooldown: ignore crossings within this many seconds after the last
    // detected one. Time-based so it works at any source rate (RaceBox 50Hz,
    // phone GPS 1-10Hz) without recomputing a sample count.
    private val crossingCooldownSec: Double = 3.0
    private var lastCrossingTime: Double = -3600.0

    private val json = Json { ignoreUnknownKeys = true }

    // App is RaceBox-only — phone GPS samples are dropped by GpsViewModel
    // before they reach the LapTracker, so this is always "racebox".
    var gpsSource: String = "racebox"
    private var uploadedLapCount = 0

    val hasFinishLine: Boolean get() = finishLine != null

    // ── Finish line persistence ──

    fun setFinishLine(fl: FinishLine) {
        // Only wipe lap state if the new line is actually different from the
        // currently-applied one. DriverScreen refreshes circuits on appear /
        // foreground — we don't want a routine refresh to clobber an
        // in-progress pilot session just because nothing changed.
        val changed = finishLine != fl
        finishLine = fl
        prefs.putString("bbn_finish_line", json.encodeToString(FinishLine.serializer(), fl))
        if (changed) reset()
    }

    fun loadFinishLine() {
        val raw = prefs.getString("bbn_finish_line") ?: return
        runCatching { finishLine = json.decodeFromString(FinishLine.serializer(), raw) }
    }

    fun clearFinishLine() {
        finishLine = null
        prefs.remove("bbn_finish_line")
        reset()
    }

    fun reset() {
        _currentLap.value = 0
        _laps.value = emptyList()
        _bestLapMs.value = null
        _lastLapMs.value = null
        _deltaBestMs.value = null
        _deltaPrevMs.value = null
        _currentLapElapsedMs.value = 0.0
        lapStartTime = null
        lastSample = null
        lapDistanceM = 0.0
        lapMaxSpeed = 0.0
        resetCurrentArrays()
        bestLap = null
        prevLap = null
        lastCrossingTime = -3600.0
        uploadedLapCount = 0
    }

    /**
     * Clears the best-lap reference (and the live delta) so the next
     * completed lap becomes the new best — used to make the GPS delta
     * track the current stint instead of the all-time session best.
     * Call this on pit exit, when a new stint begins.
     */
    fun resetStintBest() {
        _bestLapMs.value = null
        bestLap = null
        _deltaBestMs.value = null
    }

    private fun resetCurrentArrays() {
        curDistances.clear()
        curTimestamps.clear()
        curPositions.clear()
        curSpeeds.clear()
        curGforceLat.clear()
        curGforceLon.clear()
    }

    fun processSample(sample: GPSSample) {
        lastSample?.let { prev ->
            val dist = GeoUtils.haversineDistance(prev.lat, prev.lon, sample.lat, sample.lon)
            if (dist < 50) lapDistanceM += dist
            if (sample.speedKmh > lapMaxSpeed) lapMaxSpeed = sample.speedKmh

            finishLine?.let { fl ->
                if (sample.fixType >= 3 && (sample.timestamp - lastCrossingTime) > crossingCooldownSec) {
                    val frac = GeoUtils.segmentCrossingFraction(
                        GeoPoint(prev.lat, prev.lon),
                        GeoPoint(sample.lat, sample.lon),
                        fl.p1, fl.p2,
                    )
                    if (frac != null) {
                        lastCrossingTime = sample.timestamp
                        completeLap(sample.timestamp)
                    }
                }
            }
        }

        if (lapStartTime == null) lapStartTime = sample.timestamp

        curDistances.add(lapDistanceM)
        curTimestamps.add(sample.timestamp)
        curPositions.add(sample.lat to sample.lon)
        curSpeeds.add(sample.speedKmh)
        curGforceLat.add(sample.gForceX)
        curGforceLon.add(sample.gForceY)

        lapStartTime?.let { start ->
            _currentLapElapsedMs.value = (sample.timestamp - start) * 1000
        }

        computeDeltas()
        lastSample = sample
    }

    private fun completeLap(time: Double) {
        val start = lapStartTime ?: return
        val durationMs = (time - start) * 1000
        if (durationMs <= 5000) return

        _currentLap.value += 1
        val record = LapRecord(
            lapNumber = _currentLap.value,
            durationMs = durationMs,
            totalDistanceM = lapDistanceM,
            maxSpeedKmh = lapMaxSpeed,
            distances = curDistances.toList(),
            timestamps = curTimestamps.toList(),
            positions = curPositions.toList(),
            speeds = curSpeeds.toList(),
            gforceLat = curGforceLat.toList(),
            gforceLon = curGforceLon.toList(),
        )
        _laps.value = _laps.value + record
        _lastLapMs.value = durationMs

        prevLap = record
        val currentBest = _bestLapMs.value
        if (currentBest == null || durationMs < currentBest) {
            _bestLapMs.value = durationMs
            bestLap = record
        }

        lapStartTime = time
        lapDistanceM = 0.0
        lapMaxSpeed = 0.0
        resetCurrentArrays()
        _deltaBestMs.value = null
        _deltaPrevMs.value = null
        _currentLapElapsedMs.value = 0.0

        uploadNewLaps()
    }

    private fun computeDeltas() {
        val start = lapStartTime
        val last = lastSample
        if (start == null || last == null) {
            _deltaBestMs.value = null
            _deltaPrevMs.value = null
            return
        }
        val currentElapsedMs = (last.timestamp - start) * 1000
        val currentDist = lapDistanceM
        _deltaBestMs.value = interpolateDelta(currentDist, currentElapsedMs, bestLap)
        _deltaPrevMs.value = interpolateDelta(currentDist, currentElapsedMs, prevLap)
    }

    private fun interpolateDelta(
        currentDist: Double,
        currentElapsedMs: Double,
        ref: LapRecord?,
    ): Double? {
        if (ref == null || ref.distances.size < 2 || currentDist <= 0) return null
        val dists = ref.distances
        val times = ref.timestamps
        if (currentDist > dists.last()) return null

        var lo = 0
        var hi = dists.size - 1
        while (lo < hi) {
            val mid = (lo + hi) ushr 1
            if (dists[mid] < currentDist) lo = mid + 1 else hi = mid
        }
        val i = maxOf(0, lo - 1)
        val j = minOf(lo, dists.size - 1)

        val refElapsedMs = if (i == j || dists[j] == dists[i]) {
            (times[i] - times[0]) * 1000
        } else {
            val frac = (currentDist - dists[i]) / (dists[j] - dists[i])
            val refTime = times[i] + frac * (times[j] - times[i])
            (refTime - times[0]) * 1000
        }
        return currentElapsedMs - refElapsedMs
    }

    private fun uploadNewLaps() {
        val all = _laps.value
        val newLaps = all.drop(uploadedLapCount)
        if (newLaps.isEmpty()) return
        uploadedLapCount = all.size

        // Save the full RaceBox stream at ~50Hz (no downsample). Phone GPS
        // tops out at ~1-10Hz so the same code path keeps everything that
        // arrives. distances/timestamps were already full rate; positions,
        // speeds and g-force now match.
        scope.launch(Dispatchers.IO) {
            try {
                api.saveGpsLaps(newLaps.map { lap ->
                    val t0 = lap.timestamps.firstOrNull() ?: 0.0
                    mapOf(
                        "lap_number" to lap.lapNumber,
                        "duration_ms" to lap.durationMs,
                        "total_distance_m" to lap.totalDistanceM,
                        "max_speed_kmh" to lap.maxSpeedKmh,
                        "distances" to lap.distances,
                        "timestamps" to lap.timestamps.map { it - t0 },
                        "positions" to lap.positions.map { mapOf("lat" to it.first, "lon" to it.second) },
                        "speeds" to lap.speeds,
                        "gforce_lat" to lap.gforceLat,
                        "gforce_lon" to lap.gforceLon,
                        "gps_source" to gpsSource,
                    )
                })
            } catch (e: Throwable) {
                uploadedLapCount -= newLaps.size
            }
        }
    }
}
