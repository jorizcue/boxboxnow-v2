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

    @Published var projectedLapMs: Double?

    private static let searchFwd = 60
    private static let searchBack = 20
    private static let maxPerpM = 25.0
    private static let smoothCap = 10

    private var refAnchorBest = 0
    private var refAnchorPrev = 0
    private var bestSmoothBuf: [Double] = []
    private var prevSmoothBuf: [Double] = []

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

    // Configured kart number for the active session, written into each
    // uploaded lap so the dashboard replay can sync GPS samples with
    // Apex Timing data for the same physical kart.
    var ourKartNumber: Int = 0

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
        refAnchorBest = 0; refAnchorPrev = 0
        bestSmoothBuf.removeAll(); prevSmoothBuf.removeAll()
        projectedLapMs = nil
    }

    /// Clears the best-lap reference (and the live delta) so the next
    /// completed lap becomes the new best — used to make the GPS delta
    /// track the current stint instead of the all-time session best.
    /// Call this on pit exit, when a new stint begins.
    func resetStintBest() {
        bestLapMs = nil
        bestLap = nil
        deltaBestMs = nil
        refAnchorBest = 0; bestSmoothBuf.removeAll(); projectedLapMs = nil
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

        // Compute cross-track deltas
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
        refAnchorBest = 0; refAnchorPrev = 0
        bestSmoothBuf.removeAll(); prevSmoothBuf.removeAll()
        projectedLapMs = nil

        // Auto-upload new laps to backend
        uploadNewLaps()
    }

    // MARK: - Cross-track (position-based) delta

    private func smooth(_ buf: inout [Double], _ v: Double) -> Double {
        buf.append(v)
        if buf.count > Self.smoothCap { buf.removeFirst() }
        return buf.reduce(0, +) / Double(buf.count)
    }

    /// Cross-track delta vs a reference lap using a monotonic moving anchor.
    /// Returns (rawDeltaMs, matchedSegmentIndex) or nil if no valid projection
    /// (off the reference line, or no reference). Sign: + = behind reference.
    private func crossTrackDelta(
        lat: Double, lon: Double, currentElapsedMs: Double,
        ref: LapRecord, anchor: Int
    ) -> (delta: Double, index: Int)? {
        let pos = ref.positions
        let n = pos.count
        guard n >= 2 else { return nil }
        var bestPerp = Double.greatestFiniteMagnitude
        var bestK = -1, bestT = 0.0
        func scan(_ lo: Int, _ hi: Int) {
            guard lo <= hi else { return }
            var k = lo
            while k <= hi {
                let r = GeoUtils.crossTrackProjection(
                    pLat: lat, pLon: lon,
                    aLat: pos[k].lat, aLon: pos[k].lon,
                    bLat: pos[k + 1].lat, bLon: pos[k + 1].lon)
                if r.perpMeters < bestPerp { bestPerp = r.perpMeters; bestK = k; bestT = r.t }
                k += 1
            }
        }
        let a = min(max(0, anchor), n - 2)
        scan(a, min(n - 2, a + Self.searchFwd))
        if bestK < 0 || bestPerp > Self.maxPerpM {
            scan(max(0, a - Self.searchBack), a)
        }
        guard bestK >= 0, bestPerp <= Self.maxPerpM else { return nil }
        let t0 = ref.timestamps[0]
        let refTimeS = (ref.timestamps[bestK]
            + bestT * (ref.timestamps[bestK + 1] - ref.timestamps[bestK])) - t0
        return (currentElapsedMs - refTimeS * 1000, bestK)
    }

    private func computeDeltas() {
        guard let start = lapStartTime, let last = lastSample, last.fixType >= 3 else {
            deltaBestMs = nil; deltaPrevMs = nil; projectedLapMs = nil
            bestSmoothBuf.removeAll(); prevSmoothBuf.removeAll()
            return
        }
        let elapsed = (last.timestamp - start) * 1000

        if let ref = bestLap,
           let r = crossTrackDelta(lat: last.lat, lon: last.lon,
                                   currentElapsedMs: elapsed, ref: ref, anchor: refAnchorBest) {
            refAnchorBest = r.index
            let d = smooth(&bestSmoothBuf, r.delta)
            deltaBestMs = d
            projectedLapMs = ref.durationMs + d
        } else {
            deltaBestMs = nil; projectedLapMs = nil; bestSmoothBuf.removeAll()
        }

        if let ref = prevLap,
           let r = crossTrackDelta(lat: last.lat, lon: last.lon,
                                   currentElapsedMs: elapsed, ref: ref, anchor: refAnchorPrev) {
            refAnchorPrev = r.index
            deltaPrevMs = smooth(&prevSmoothBuf, r.delta)
        } else {
            deltaPrevMs = nil; prevSmoothBuf.removeAll()
        }
    }

    // MARK: - Upload laps to backend (matching web useGpsTelemetrySave)

    private func uploadNewLaps() {
        let newLaps = Array(laps.dropFirst(uploadedLapCount))
        guard !newLaps.isEmpty else { return }
        uploadedLapCount = laps.count

        // Save the full RaceBox stream at ~50Hz (no downsample). Phone GPS
        // tops out at ~1-10Hz so the same code path keeps everything that
        // arrives. distances/timestamps were already full rate; positions,
        // speeds and g-force now match.
        let payload = newLaps.map { lap -> [String: Any] in
            var item: [String: Any] = [
                "lap_number": lap.lapNumber,
                "duration_ms": lap.durationMs,
                "total_distance_m": lap.totalDistanceM,
                "max_speed_kmh": lap.maxSpeedKmh,
                "distances": lap.distances,
                "timestamps": lap.timestamps.map { $0 - (lap.timestamps.first ?? 0) },
                "positions": lap.positions.map { ["lat": $0.lat, "lon": $0.lon] },
                "speeds": lap.speeds,
                "gforce_lat": lap.gforceLat,
                "gforce_lon": lap.gforceLon,
                "gps_source": gpsSource,
            ]
            if ourKartNumber > 0 { item["kart_number"] = ourKartNumber }
            return item
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

    #if DEBUG
    func setBestLapForTest(_ r: LapRecord) { bestLap = r; refAnchorBest = 0; bestSmoothBuf.removeAll() }
    func crossTrackDeltaForTest(lat: Double, lon: Double, currentElapsedMs: Double) -> (delta: Double, index: Int)? {
        guard let ref = bestLap else { return nil }
        return crossTrackDelta(lat: lat, lon: lon, currentElapsedMs: currentElapsedMs, ref: ref, anchor: refAnchorBest)
    }
    #endif

}
