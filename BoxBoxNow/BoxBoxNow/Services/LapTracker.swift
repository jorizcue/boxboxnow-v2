import Foundation
import Combine

final class LapTracker: ObservableObject {
    /// Full lap record with per-sample telemetry arrays matching web LapRecord.
    struct LapRecord {
        let lapNumber: Int
        let durationMs: Double
        let totalDistanceM: Double
        let maxSpeedKmh: Double
        let distances: [Double]                     // cumulative meters
        let timestamps: [Double]                    // CACurrentMediaTime seconds
        let positions: [(lat: Double, lon: Double)] // GPS positions
        let speeds: [Double]                        // km/h per sample
        let gforceLat: [Double]                     // lateral g-force (x)
        let gforceLon: [Double]                     // longitudinal g-force (y)
    }

    @Published var currentLap: Int = 0
    @Published var laps: [LapRecord] = []
    @Published var bestLapMs: Double?
    @Published var lastLapMs: Double?
    @Published var deltaBestMs: Double?
    @Published var deltaPrevMs: Double?
    @Published var currentLapElapsedMs: Double = 0

    private var finishLine: FinishLine?
    private var lapStartTime: TimeInterval?
    private var lastSample: GPSSample?
    private var lapDistanceM: Double = 0
    private var lapMaxSpeed: Double = 0

    // Per-sample arrays for current lap (built live)
    private var curDistances: [Double] = []
    private var curTimestamps: [Double] = []
    private var curPositions: [(lat: Double, lon: Double)] = []
    private var curSpeeds: [Double] = []
    private var curGforceLat: [Double] = []
    private var curGforceLon: [Double] = []

    // Reference laps for delta calculation
    private var bestLap: LapRecord?
    private var prevLap: LapRecord?

    // Cooldown: ignore crossings within this many seconds after the last
    // detected one. Time-based so it works at any source rate (RaceBox 50Hz,
    // phone GPS 1-10Hz) without recomputing a sample count.
    private static let crossingCooldownSec: TimeInterval = 3.0
    private var lastCrossingTime: TimeInterval = -3600  // far past = first crossing allowed

    // GPS source for upload tagging
    var gpsSource: String = "phone"

    // Auto-upload: number of laps already sent
    private var uploadedLapCount = 0

    // MARK: - Finish line persistence

    private static let finishLineKey = "bbn_finish_line"

    func setFinishLine(_ fl: FinishLine) {
        // Only wipe lap state if the new line is actually different from the
        // currently-applied one. Otherwise a routine circuit refresh (e.g.
        // DriverView re-reading circuits on appear) would clobber a pilot's
        // in-progress session — even though the admin hasn't changed a thing.
        let changed = (finishLine != fl)
        finishLine = fl
        // Persist to UserDefaults
        if let data = try? JSONEncoder().encode(fl) {
            UserDefaults.standard.set(data, forKey: Self.finishLineKey)
        }
        if changed { reset() }
    }

    func loadFinishLine() {
        if let data = UserDefaults.standard.data(forKey: Self.finishLineKey),
           let fl = try? JSONDecoder().decode(FinishLine.self, from: data) {
            finishLine = fl
        }
    }

    func clearFinishLine() {
        finishLine = nil
        UserDefaults.standard.removeObject(forKey: Self.finishLineKey)
        reset()
    }

    var hasFinishLine: Bool { finishLine != nil }

    /// Read-only access to the configured finish line (for debug overlays).
    var currentFinishLine: FinishLine? { finishLine }

    /// Live current-lap distance in meters (for debug overlays).
    var currentLapDistanceM: Double { lapDistanceM }

    /// Total distance of the best-lap reference (for debug overlays).
    /// Nil when no best lap has been recorded yet.
    var bestLapDistanceM: Double? { bestLap?.totalDistanceM }

    // MARK: - Reset

    func reset() {
        currentLap = 0; laps.removeAll()
        bestLapMs = nil; lastLapMs = nil
        deltaBestMs = nil; deltaPrevMs = nil
        currentLapElapsedMs = 0
        lapStartTime = nil; lastSample = nil
        lapDistanceM = 0; lapMaxSpeed = 0
        resetCurrentArrays()
        bestLap = nil; prevLap = nil
        lastCrossingTime = -3600
        uploadedLapCount = 0
    }

    private func resetCurrentArrays() {
        curDistances.removeAll()
        curTimestamps.removeAll()
        curPositions.removeAll()
        curSpeeds.removeAll()
        curGforceLat.removeAll()
        curGforceLon.removeAll()
    }

    // MARK: - Process GPS sample

    func processSample(_ sample: GPSSample) {
        defer { lastSample = sample }

        // Accumulate distance
        if let prev = lastSample {
            let dist = GeoUtils.haversineDistance(
                lat1: prev.lat, lon1: prev.lon,
                lat2: sample.lat, lon2: sample.lon)
            // Filter GPS jitter: reject jumps > 50m in one sample
            if dist < 50 {
                lapDistanceM += dist
            }
            lapMaxSpeed = max(lapMaxSpeed, sample.speedKmh)

            // Check finish line crossing (with cooldown + 3D fix)
            if let fl = finishLine,
               sample.fixType >= 3,
               sample.timestamp - lastCrossingTime > Self.crossingCooldownSec {
                let frac = GeoUtils.segmentCrossingFraction(
                    a1: GeoPoint(lat: prev.lat, lon: prev.lon),
                    a2: GeoPoint(lat: sample.lat, lon: sample.lon),
                    b1: fl.p1, b2: fl.p2)
                if frac != nil {
                    lastCrossingTime = sample.timestamp
                    completeLap(at: sample.timestamp)
                }
            }
        }

        if lapStartTime == nil { lapStartTime = sample.timestamp }

        // Record per-sample telemetry
        curDistances.append(lapDistanceM)
        curTimestamps.append(sample.timestamp)
        curPositions.append((lat: sample.lat, lon: sample.lon))
        curSpeeds.append(sample.speedKmh)
        curGforceLat.append(sample.gForceX)
        curGforceLon.append(sample.gForceY)

        // Update elapsed time
        if let start = lapStartTime {
            currentLapElapsedMs = (sample.timestamp - start) * 1000
        }

        // Compute distance-interpolated deltas
        computeDeltas()
    }

    // MARK: - Lap completion

    private func completeLap(at time: TimeInterval) {
        guard let start = lapStartTime else { return }
        let durationMs = (time - start) * 1000
        guard durationMs > 5000 else { return } // ignore very short "laps"

        currentLap += 1
        let record = LapRecord(
            lapNumber: currentLap,
            durationMs: durationMs,
            totalDistanceM: lapDistanceM,
            maxSpeedKmh: lapMaxSpeed,
            distances: curDistances,
            timestamps: curTimestamps,
            positions: curPositions,
            speeds: curSpeeds,
            gforceLat: curGforceLat,
            gforceLon: curGforceLon
        )
        laps.append(record)
        lastLapMs = durationMs

        // Update reference laps
        prevLap = record
        if bestLapMs == nil || durationMs < bestLapMs! {
            bestLapMs = durationMs
            bestLap = record
        }

        // Reset for next lap
        lapStartTime = time
        lapDistanceM = 0
        lapMaxSpeed = 0
        resetCurrentArrays()
        deltaBestMs = nil
        deltaPrevMs = nil
        currentLapElapsedMs = 0

        // Auto-upload new laps to backend
        uploadNewLaps()
    }

    // MARK: - Distance-interpolated delta (matching web computeDelta)

    private func computeDeltas() {
        guard let start = lapStartTime, let last = lastSample else {
            deltaBestMs = nil; deltaPrevMs = nil; return
        }
        let currentElapsedMs = (last.timestamp - start) * 1000
        let currentDist = lapDistanceM

        deltaBestMs = interpolateDelta(
            currentDist: currentDist,
            currentElapsedMs: currentElapsedMs,
            ref: bestLap
        )
        deltaPrevMs = interpolateDelta(
            currentDist: currentDist,
            currentElapsedMs: currentElapsedMs,
            ref: prevLap
        )
    }

    /// Binary search + linear interpolation to find reference lap time
    /// at the same distance, then return the time delta in ms.
    /// Positive = behind reference, negative = ahead of reference.
    private func interpolateDelta(
        currentDist: Double,
        currentElapsedMs: Double,
        ref: LapRecord?
    ) -> Double? {
        guard let ref = ref, ref.distances.count >= 2, currentDist > 0 else {
            return nil
        }
        let dists = ref.distances
        let times = ref.timestamps

        // Beyond reference lap distance
        guard currentDist <= dists[dists.count - 1] else { return nil }

        // Binary search
        var lo = 0, hi = dists.count - 1
        while lo < hi {
            let mid = (lo + hi) >> 1
            if dists[mid] < currentDist { lo = mid + 1 }
            else { hi = mid }
        }

        // Linear interpolation
        let i = max(0, lo - 1)
        let j = min(lo, dists.count - 1)

        let refElapsedMs: Double
        if i == j || dists[j] == dists[i] {
            refElapsedMs = (times[i] - times[0]) * 1000
        } else {
            let frac = (currentDist - dists[i]) / (dists[j] - dists[i])
            let refTime = times[i] + frac * (times[j] - times[i])
            refElapsedMs = (refTime - times[0]) * 1000
        }

        return currentElapsedMs - refElapsedMs
    }

    // MARK: - Upload laps to backend (matching web useGpsTelemetrySave)

    private func uploadNewLaps() {
        let newLaps = Array(laps.dropFirst(uploadedLapCount))
        guard !newLaps.isEmpty else { return }
        uploadedLapCount = laps.count

        // Detect actual source Hz from the lap's own sample timing so the
        // downsample step lands at the intended target rate regardless of
        // whether the source is RaceBox (~50Hz) or phone GPS (~1-10Hz).
        let payload = newLaps.map { lap -> [String: Any] in
            let sourceHz = estimatedSourceHz(timestamps: lap.timestamps)
            return [
                "lap_number": lap.lapNumber,
                "duration_ms": lap.durationMs,
                "total_distance_m": lap.totalDistanceM,
                "max_speed_kmh": lap.maxSpeedKmh,
                "distances": lap.distances,
                "timestamps": lap.timestamps.map { $0 - (lap.timestamps.first ?? 0) },
                // Target ≥4 samples/s for smooth playback. Use 5Hz so we
                // always exceed 4 even with rounding loss.
                "positions": downsample(lap.positions.map { ["lat": $0.lat, "lon": $0.lon] }, targetHz: 5, sourceHz: sourceHz),
                "speeds": downsample(lap.speeds, targetHz: 5, sourceHz: sourceHz),
                "gforce_lat": downsample(lap.gforceLat, targetHz: 5, sourceHz: sourceHz),
                "gforce_lon": downsample(lap.gforceLon, targetHz: 5, sourceHz: sourceHz),
                "gps_source": gpsSource,
            ]
        }

        Task {
            do {
                try await APIClient.shared.saveGpsLaps(payload)
                print("[LapTracker] Uploaded \(payload.count) laps")
            } catch {
                print("[LapTracker] Upload failed: \(error.localizedDescription)")
                // Revert count so we retry next lap
                await MainActor.run { uploadedLapCount -= newLaps.count }
            }
        }
    }

    /// Downsample an array from sourceHz to targetHz, keeping first and last
    /// elements. Matches web `downsample()` in useGpsTelemetrySave.ts.
    private func downsample<T>(_ arr: [T], targetHz: Double, sourceHz: Double = 10) -> [T] {
        guard arr.count > 2 else { return arr }
        let step = max(1, Int((sourceHz / targetHz).rounded()))
        var result: [T] = [arr[0]]
        var i = step
        while i < arr.count - 1 {
            result.append(arr[i])
            i += step
        }
        result.append(arr[arr.count - 1])
        return result
    }

    /// Estimate sample rate from the captured timestamps. Falls back to 10Hz
    /// when the array is too small to compute a stable mean.
    private func estimatedSourceHz(timestamps: [TimeInterval]) -> Double {
        guard timestamps.count >= 10 else { return 10 }
        let span = timestamps.last! - timestamps.first!
        guard span > 0 else { return 10 }
        return Double(timestamps.count - 1) / span
    }
}
