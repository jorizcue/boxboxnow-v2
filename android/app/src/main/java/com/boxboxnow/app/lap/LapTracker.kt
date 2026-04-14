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

    private val crossingCooldown = 75
    private var samplesSinceCrossing = crossingCooldown + 1

    private val json = Json { ignoreUnknownKeys = true }

    var gpsSource: String = "phone"
    private var uploadedLapCount = 0

    val hasFinishLine: Boolean get() = finishLine != null

    // ── Finish line persistence ──

    fun setFinishLine(fl: FinishLine) {
        finishLine = fl
        prefs.putString("bbn_finish_line", json.encodeToString(FinishLine.serializer(), fl))
        reset()
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
        samplesSinceCrossing = crossingCooldown + 1
        uploadedLapCount = 0
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
        samplesSinceCrossing++

        lastSample?.let { prev ->
            val dist = GeoUtils.haversineDistance(prev.lat, prev.lon, sample.lat, sample.lon)
            if (dist < 50) lapDistanceM += dist
            if (sample.speedKmh > lapMaxSpeed) lapMaxSpeed = sample.speedKmh

            finishLine?.let { fl ->
                if (sample.fixType >= 3 && samplesSinceCrossing > crossingCooldown) {
                    val frac = GeoUtils.segmentCrossingFraction(
                        GeoPoint(prev.lat, prev.lon),
                        GeoPoint(sample.lat, sample.lon),
                        fl.p1, fl.p2,
                    )
                    if (frac != null) {
                        samplesSinceCrossing = 0
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
                        "positions" to downsample(lap.positions.map { mapOf("lat" to it.first, "lon" to it.second) }),
                        "speeds" to downsample(lap.speeds),
                        "gforce_lat" to downsample(lap.gforceLat),
                        "gforce_lon" to downsample(lap.gforceLon),
                        "gps_source" to gpsSource,
                    )
                })
            } catch (e: Throwable) {
                uploadedLapCount -= newLaps.size
            }
        }
    }

    /** Downsample from ~10Hz to ~2Hz, keeping first and last. */
    private fun <T> downsample(arr: List<T>, targetHz: Double = 2.0, sourceHz: Double = 10.0): List<T> {
        if (arr.size <= 2) return arr
        val step = maxOf(1, (sourceHz / targetHz).toInt())
        val result = mutableListOf(arr[0])
        var i = step
        while (i < arr.size - 1) { result.add(arr[i]); i += step }
        result.add(arr.last())
        return result
    }
}
