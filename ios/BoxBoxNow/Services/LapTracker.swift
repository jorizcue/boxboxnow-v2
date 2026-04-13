import Foundation
import Combine

final class LapTracker: ObservableObject {
    struct LapRecord {
        let lapNumber: Int
        let durationMs: Double
        let totalDistanceM: Double
        let maxSpeedKmh: Double
    }

    @Published var currentLap: Int = 0
    @Published var laps: [LapRecord] = []
    @Published var bestLapMs: Double?
    @Published var lastLapMs: Double?
    @Published var deltaMs: Double?

    private var finishLine: FinishLine?
    private var lapStartTime: TimeInterval?
    private var lastSample: GPSSample?
    private var lapDistanceM: Double = 0
    private var lapMaxSpeed: Double = 0
    private var bestLapSamples: [GPSSample] = []
    private var currentLapSamples: [GPSSample] = []

    func setFinishLine(_ fl: FinishLine) {
        finishLine = fl
        reset()
    }

    func reset() {
        currentLap = 0; laps.removeAll()
        bestLapMs = nil; lastLapMs = nil; deltaMs = nil
        lapStartTime = nil; lastSample = nil
        lapDistanceM = 0; lapMaxSpeed = 0
        bestLapSamples.removeAll(); currentLapSamples.removeAll()
    }

    func processSample(_ sample: GPSSample) {
        defer { lastSample = sample }
        currentLapSamples.append(sample)

        if let prev = lastSample {
            let dist = GeoUtils.haversineDistance(
                lat1: prev.lat, lon1: prev.lon, lat2: sample.lat, lon2: sample.lon)
            lapDistanceM += dist
            lapMaxSpeed = max(lapMaxSpeed, sample.speedKmh)

            if let fl = finishLine {
                let crossed = GeoUtils.segmentsIntersect(
                    p1: GeoPoint(lat: prev.lat, lon: prev.lon),
                    p2: GeoPoint(lat: sample.lat, lon: sample.lon),
                    p3: fl.p1, p4: fl.p2)
                if crossed { completeLap(at: sample.timestamp) }
            }
        }

        if lapStartTime == nil { lapStartTime = sample.timestamp }
        computeDelta()
    }

    private func completeLap(at time: TimeInterval) {
        guard let start = lapStartTime else { return }
        let durationMs = (time - start) * 1000
        guard durationMs > 5000 else { return } // ignore very short "laps"

        currentLap += 1
        let record = LapRecord(
            lapNumber: currentLap,
            durationMs: durationMs,
            totalDistanceM: lapDistanceM,
            maxSpeedKmh: lapMaxSpeed
        )
        laps.append(record)
        lastLapMs = durationMs

        if bestLapMs == nil || durationMs < bestLapMs! {
            bestLapMs = durationMs
            bestLapSamples = currentLapSamples
        }

        lapStartTime = time
        lapDistanceM = 0
        lapMaxSpeed = 0
        currentLapSamples.removeAll()
    }

    private func computeDelta() {
        guard let best = bestLapMs, let start = lapStartTime, let last = lastSample else {
            deltaMs = nil; return
        }
        let elapsed = (last.timestamp - start) * 1000
        deltaMs = elapsed - best
    }
}
