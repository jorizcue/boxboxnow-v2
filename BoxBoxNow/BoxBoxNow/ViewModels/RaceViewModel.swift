import Foundation
import Combine

extension Notification.Name {
    /// Fired when the race WebSocket delivers a `preset_default_changed`
    /// event. DriverViewModel listens for this and re-applies the new
    /// default preset live while the pilot is on track.
    static let presetDefaultChanged = Notification.Name("presetDefaultChanged")

    /// Fired when the admin edits the GPS finish-line of a circuit that
    /// this device is subscribed to. DriverView listens for this and
    /// pushes the new coords into LapTracker without waiting for the next
    /// foreground / restart cycle.
    static let circuitUpdated = Notification.Name("circuitUpdated")
}

final class RaceViewModel: ObservableObject {
    @Published var karts: [KartState] = []
    @Published var isConnected = false
    @Published var raceTimerMs: Double = 0
    @Published var raceStatus = ""
    @Published var sessionName = ""
    @Published var raceStarted = false
    @Published var raceFinished = false
    @Published var countdownMs: Double = 0
    @Published var durationMs: Double = 0
    @Published var boxScore: Double = 0
    @Published var replayActive = false
    @Published var boxCallActive = false
    @Published var boxCallDate = Date()

    // Race config (updated live from WS snapshot config)
    @Published var ourKartNumber: Int = 0
    @Published var circuitLengthM: Double = 1100
    @Published var pitTimeS: Double = 0
    @Published var durationMin: Double = 0
    @Published var minPits: Int = 0
    @Published var maxStintMin: Double = 0
    @Published var minStintMin: Double = 0
    @Published var minDriverTimeMin: Double = 0

    // Sector telemetry — only present on circuits whose Apex grid declares
    // `s1|s2|s3` columns. `hasSectors` flips true the first time the
    // backend reports a sector event in this session; it gates whether
    // the sector-related driver cards (Δ S1/S2/S3 + theoretical-best)
    // show data or stay in the "--" placeholder. `sectorMeta` carries
    // the field-wide leader per sector (kart number + driver/team +
    // best ms + 2nd best ms).
    @Published var hasSectors: Bool = false
    @Published var sectorMeta: SectorMeta? = nil

    private let wsClient = WebSocketClient()
    private var cancellables = Set<AnyCancellable>()

    // Clock reference point: the server value and wall-clock time it was received.
    // The View uses TimelineView to interpolate smoothly between server updates.
    @Published var serverCountdownMs: Double = 0
    @Published var serverCountdownDate: Date = Date()

    init() {
        wsClient.$isConnected
            .receive(on: DispatchQueue.main)
            .assign(to: &$isConnected)

        wsClient.onMessage = { [weak self] text in
            self?.handleMessage(text)
        }
    }

    func connect() {
        guard let token = KeychainHelper.loadToken() else {
            print("[RaceVM] No token for WS connection")
            return
        }
        let urlStr = "\(Constants.wsBaseURL)/race?token=\(token)&device=mobile&view=driver"
        print("[RaceVM] Connecting to: \(urlStr)")
        wsClient.connectToURL(urlStr)
    }

    func disconnect() { wsClient.disconnect() }

    /// Ask server to re-resolve state and send a fresh snapshot.
    /// Useful after returning from background or when replay/live switch is needed.
    func requestSnapshot() {
        wsClient.send("{\"type\":\"requestSnapshot\"}")
    }

    // MARK: - Clock interpolation (matching web useRaceClock)
    // Server sends countdown every ~30s. View interpolates with TimelineView.

    private func recalibrateServerClock(_ serverMs: Double) {
        serverCountdownMs = serverMs
        serverCountdownDate = Date()
        countdownMs = serverMs
        raceTimerMs = serverMs
    }

    /// Call from TimelineView to get smooth interpolated clock value
    func interpolatedClockMs(at now: Date) -> Double {
        guard serverCountdownMs > 0, !raceFinished else { return 0 }
        let wallElapsedMs = now.timeIntervalSince(serverCountdownDate) * 1000
        return max(0, serverCountdownMs - wallElapsedMs)
    }

    // MARK: - Calculations matching web DriverView.tsx

    /// Stable speed (m/s) — web: stableSpeedMs() in classificationUtils.ts
    func stableSpeedMs(_ kart: KartState) -> Double {
        guard let avg = kart.avgLapMs, avg > 0 else { return 0 }
        if let last = kart.lastLapMs, last > 0 {
            let ratio = last / avg
            if ratio >= 0.85 && ratio <= 1.15 {
                let blended = avg * 0.7 + last * 0.3
                return circuitLengthM / (blended / 1000)
            }
        }
        return circuitLengthM / (avg / 1000)
    }

    /// Adjusted classification — web: useMemo ourData in DriverView.tsx lines 298-365
    struct OurData {
        let realPosition: Int
        let totalKarts: Int
        let aheadKart: KartState?
        let behindKart: KartState?
        let aheadSeconds: Double
        let behindSeconds: Double
    }

    func computeOurData(ourKartNumber: Int, clockMs: Double = 0) -> OurData? {
        guard ourKartNumber > 0, !karts.isEmpty else { return nil }
        let clock = clockMs > 0 ? clockMs : raceTimerMs

        struct MappedKart {
            let kart: KartState
            let speedMs: Double
            let adjDist: Double
        }

        let mapped = karts
            .filter { $0.totalLaps > 0 }
            .map { kart -> MappedKart in
                let speedMs = stableSpeedMs(kart)
                let baseDistM = Double(kart.totalLaps) * circuitLengthM

                var metersExtra = 0.0
                if kart.pitStatus == "racing" && speedMs > 0 {
                    if let stintStartCD = kart.stintStartCountdownMs, stintStartCD > 0, clock != 0 {
                        let stintTimeMs = stintStartCD - clock
                        let sinceCrossMs = stintTimeMs - (kart.stintElapsedMs ?? 0)
                        if sinceCrossMs > 0 {
                            metersExtra = (sinceCrossMs / 1000) * speedMs
                        }
                    }
                    metersExtra = min(metersExtra, circuitLengthM * 0.95)
                }

                let totalDist = baseDistM + metersExtra
                let missing = Double(max(0, minPits - kart.pitCount))
                let penalty = missing * speedMs * pitTimeS
                let adjDist = totalDist - penalty

                return MappedKart(kart: kart, speedMs: speedMs, adjDist: adjDist)
            }
            .sorted { $0.adjDist > $1.adjDist }

        guard let ourIdx = mapped.firstIndex(where: { $0.kart.kartNumber == ourKartNumber }) else { return nil }

        let our = mapped[ourIdx]
        let ahead = ourIdx > 0 ? mapped[ourIdx - 1] : nil
        let behind = ourIdx < mapped.count - 1 ? mapped[ourIdx + 1] : nil

        let aheadDistDiff = ahead != nil ? ahead!.adjDist - our.adjDist : 0
        let aheadTimeDiff = our.speedMs > 0 ? aheadDistDiff / our.speedMs : 0

        let behindDistDiff = behind != nil ? our.adjDist - behind!.adjDist : 0
        let behindTimeDiff = behind != nil && behind!.speedMs > 0 ? behindDistDiff / behind!.speedMs : 0

        return OurData(
            realPosition: ourIdx + 1,
            totalKarts: mapped.count,
            aheadKart: ahead?.kart,
            behindKart: behind?.kart,
            aheadSeconds: aheadTimeDiff,
            behindSeconds: behindTimeDiff
        )
    }

    /// Race position by pace — web: lines 368-375
    func racePosition(ourKartNumber: Int) -> (pos: Int, total: Int)? {
        guard ourKartNumber > 0, !karts.isEmpty else { return nil }
        let sorted = karts
            .filter { ($0.avgLapMs ?? 0) > 0 }
            .sorted { ($0.avgLapMs ?? .infinity) < ($1.avgLapMs ?? .infinity) }
        guard let idx = sorted.firstIndex(where: { $0.kartNumber == ourKartNumber }) else { return nil }
        return (pos: idx + 1, total: sorted.count)
    }

    /// Raw Apex live timing position for `ourKartNumber` (kart.position
    /// straight from the grid `data-type="rk"` column), distinct from
    /// `racePosition` which orders by avg-lap pace. Returns
    /// `(pos, total)` where total is the number of karts that have a
    /// position assigned. `nil` until the first ranking arrives.
    func apexPosition(ourKartNumber: Int) -> (pos: Int, total: Int)? {
        guard ourKartNumber > 0, !karts.isEmpty else { return nil }
        let withPos = karts.filter { $0.position > 0 }
        guard let kart = withPos.first(where: { $0.kartNumber == ourKartNumber }) else { return nil }
        return (pos: kart.position, total: withPos.count)
    }

    /// Returns the kart at offset N from `ourKartNumber` in the Apex
    /// live timing order (sorted by `kart.position`). offset=-1 is the
    /// kart immediately ahead, offset=+1 the kart immediately behind.
    /// `nil` when our kart isn't placed yet, or the requested neighbor
    /// doesn't exist (e.g. asking for ahead of the leader).
    func apexNeighbor(ourKartNumber: Int, offset: Int) -> KartState? {
        guard ourKartNumber > 0, !karts.isEmpty else { return nil }
        let sorted = karts.filter { $0.position > 0 }.sorted { $0.position < $1.position }
        guard let idx = sorted.firstIndex(where: { $0.kartNumber == ourKartNumber }) else { return nil }
        let target = idx + offset
        guard target >= 0, target < sorted.count else { return nil }
        return sorted[target]
    }

    /// Format an Apex `interval` string for display on the driver
    /// dashboard. Apex sends three shapes:
    ///   - "0.659"  → numeric seconds → render as "0.659s"
    ///   - "1:05.279" → minute-second time → render as-is (already readable)
    ///   - "1 Tour" / "1L" → text marker for laps-down → render as-is
    /// Empty / nil values render as the leader sentinel "LIDER" — the
    /// caller decides which sentinel to use depending on context (the
    /// `intervalAhead` card always sees an empty value when the local
    /// pilot leads, so "LIDER" is the right read).
    func formatApexInterval(_ raw: String?, leaderSentinel: String = "LIDER") -> String {
        let s = (raw ?? "").trimmingCharacters(in: .whitespaces)
        if s.isEmpty { return leaderSentinel }
        if Double(s) != nil { return "\(s)s" }
        return s
    }

    /// Laps to max stint — web: lines 433-459
    struct StintCalc {
        let lapsToMax: Double?
        let realMaxStintMin: Double?
    }

    func computeStintCalc(ourKartNumber: Int, clockMs: Double = 0) -> StintCalc {
        let clock = clockMs > 0 ? clockMs : raceTimerMs
        guard ourKartNumber > 0, clock > 0, !raceFinished else {
            return StintCalc(lapsToMax: nil, realMaxStintMin: nil)
        }
        guard let kart = karts.first(where: { $0.kartNumber == ourKartNumber }),
              let avgLap = kart.avgLapMs, avgLap > 0 else {
            return StintCalc(lapsToMax: nil, realMaxStintMin: nil)
        }

        let raceClock = clock
        let stintStart = kart.stintStartCountdownMs ?? (durationMs > 0 ? durationMs : raceClock)
        let stintSec = max(0, stintStart - raceClock) / 1000

        let timeRemainingFromStintStartMin = stintStart / 1000 / 60
        let pendingPits = max(0, minPits - kart.pitCount)
        let reserveMin = pendingPits > 0 ? ((pitTimeS / 60) + minStintMin) * Double(pendingPits) : 0
        let availableMin = timeRemainingFromStintStartMin - reserveMin
        let realMax = min(maxStintMin, max(0, availableMin))

        let timeToMaxSec = max(0, realMax * 60 - stintSec)
        let laps = timeToMaxSec / (avgLap / 1000)

        return StintCalc(lapsToMax: laps, realMaxStintMin: realMax)
    }

    /// Pit window open/closed — web: lines 462-483
    func computePitWindowOpen(ourKartNumber: Int, clockMs: Double = 0) -> Bool? {
        let clock = clockMs > 0 ? clockMs : raceTimerMs
        guard ourKartNumber > 0, clock > 0, !raceFinished else { return nil }
        guard let kart = karts.first(where: { $0.kartNumber == ourKartNumber }) else { return nil }

        let raceClock = clock
        let stintStart = kart.stintStartCountdownMs ?? (durationMs > 0 ? durationMs : raceClock)
        let stintSec = max(0, stintStart - raceClock) / 1000
        let stintMin = stintSec / 60

        let pendingPits = max(0, minPits - kart.pitCount)
        let timeFromStintStartToEndMin = stintStart / 1000 / 60
        let reservePerPitMin = pendingPits > 0 ? (pitTimeS / 60 + maxStintMin) * Double(pendingPits) : 0
        let realMinStintMin = max(minStintMin, timeFromStintStartToEndMin - reservePerPitMin)

        if stintMin < realMinStintMin { return false }
        return true
    }

    /// Average future stint — web: lines 391-407
    struct AvgFutureStint {
        let avgMin: Double
        let warn: Bool
    }

    func computeAvgFutureStint(ourKartNumber: Int, clockMs: Double = 0) -> AvgFutureStint? {
        let clock = clockMs > 0 ? clockMs : raceTimerMs
        guard ourKartNumber > 0, clock > 0, !raceFinished else { return nil }
        guard let kart = karts.first(where: { $0.kartNumber == ourKartNumber }) else { return nil }
        let remainingPits = max(0, minPits - kart.pitCount)
        guard remainingPits > 0 else { return nil }
        let totalRaceMin = durationMin
        let elapsedMs = durationMs > 0 ? max(0, durationMs - clock) : 0
        let elapsedMin = elapsedMs / 1000 / 60
        let futureTimeInPitMin = Double(remainingPits) * pitTimeS / 60
        let availableRaceMin = totalRaceMin - elapsedMin - futureTimeInPitMin
        guard availableRaceMin > 0 else { return nil }
        let avgMin = availableRaceMin / Double(remainingPits)
        let tooEarly = avgMin > maxStintMin
        let tooLate = avgMin <= minStintMin + 5
        return AvgFutureStint(avgMin: avgMin, warn: tooEarly || tooLate)
    }

    /// Lap delta flash — web: useLapDelta hook
    struct LapDeltaInfo {
        let delta: String? // "faster" or "slower"
        let deltaMs: Double
    }

    // MARK: - WebSocket message handling

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[RaceVM] Failed to parse JSON")
            return
        }

        let type = json["type"] as? String ?? ""

        switch type {
        case "snapshot", "analytics":
            if let snapshotData = json["data"] as? [String: Any] {
                if let kartsArray = snapshotData["karts"] as? [[String: Any]] {
                    parseKarts(kartsArray)
                }
                if let started = snapshotData["raceStarted"] as? Bool { raceStarted = started; if started { print("[RaceVM] Race started") } }
                if let finished = snapshotData["raceFinished"] as? Bool { raceFinished = finished }
                if let durMs = asDouble(snapshotData["durationMs"]) {
                    durationMs = durMs
                    if raceTimerMs == 0 { recalibrateServerClock(durMs) }
                }
                if let trackName = snapshotData["trackName"] as? String { sessionName = trackName }
                if let countdown = asDouble(snapshotData["countdownMs"]) {
                    recalibrateServerClock(countdown)
                }

                // Extract race config from snapshot (backend sends camelCase)
                if let cfg = snapshotData["config"] as? [String: Any] {
                    ourKartNumber = asInt(cfg["ourKartNumber"]) ?? ourKartNumber
                    circuitLengthM = asDouble(cfg["circuitLengthM"]) ?? circuitLengthM
                    pitTimeS = asDouble(cfg["pitTimeS"]) ?? pitTimeS
                    durationMin = asDouble(cfg["durationMin"]) ?? durationMin
                    minPits = asInt(cfg["minPits"]) ?? minPits
                    maxStintMin = asDouble(cfg["maxStintMin"]) ?? maxStintMin
                    minStintMin = asDouble(cfg["minStintMin"]) ?? minStintMin
                    minDriverTimeMin = asDouble(cfg["minDriverTimeMin"]) ?? minDriverTimeMin
                    print("[RaceVM] Config from WS: kart=\(ourKartNumber), circuitLength=\(circuitLengthM), minPits=\(minPits)")
                }

                // Box score from fifo
                parseFifoScore(snapshotData)

                // Sector telemetry (present only on circuits with sector
                // columns). Both fields land at top level of `data`.
                // CRITICAL: only overwrite when the keys are actually
                // present in the payload — older backends (and edge
                // cases like a cluster broadcast that didn't bundle
                // sectors) would otherwise reset our cached state to
                // empty between ticks, making the sector cards flicker
                // to "--" every analytics cycle. Genuine clears come
                // through hasSectors=false explicitly, which is what
                // the backend sends on session change.
                if snapshotData.keys.contains("hasSectors") {
                    hasSectors = (snapshotData["hasSectors"] as? Bool) ?? false
                }
                if snapshotData.keys.contains("sectorMeta") {
                    sectorMeta = decodeSectorMeta(snapshotData["sectorMeta"])
                }
            }

        case "update":
            if let events = json["events"] as? [[String: Any]] {
                for event in events {
                    applyUpdateEvent(event)
                }
            }
            // Update countdown/race clock from update messages
            if let countdown = asDouble(json["countdownMs"]) {
                recalibrateServerClock(countdown)
            }
            // The backend attaches a fresh sectorMeta to update messages
            // whose batch contained a sector event (skipped otherwise to
            // save bandwidth). When present, refresh local state — the
            // SwiftUI cards observing @Published sectorMeta animate to
            // the new field-best automatically.
            if let hs = json["hasSectors"] as? Bool {
                hasSectors = hs
            }
            if json["sectorMeta"] != nil {
                sectorMeta = decodeSectorMeta(json["sectorMeta"])
            }

        case "fifo_update":
            if let msgData = json["data"] as? [String: Any] {
                parseFifoScore(msgData)
            }

        case "replay_status":
            if let rsData = json["data"] as? [String: Any] {
                let active = rsData["active"] as? Bool ?? false
                let wasActive = replayActive
                replayActive = active

                // When replay just started or stopped, ask server to re-resolve
                // our state (switch between live ↔ replay). Server will respond
                // with a fresh snapshot from the correct state.
                if active != wasActive {
                    print("[RaceVM] Replay \(active ? "started" : "stopped") — requesting snapshot")
                    wsClient.send("{\"type\":\"requestSnapshot\"}")
                }
            }

        case "box_call":
            // Pit call from web dashboard — notify the driver view
            print("[RaceVM] BOX CALL received")
            boxCallActive = true
            boxCallDate = Date()

        case "preset_default_changed":
            // Web marked a different preset as the default. Re-post as a
            // NotificationCenter event so DriverViewModel can reload + apply.
            print("[RaceVM] preset_default_changed")
            let presetId = json["preset_id"] as? Int
            NotificationCenter.default.post(
                name: .presetDefaultChanged,
                object: nil,
                userInfo: presetId.map { ["preset_id": $0] } ?? [:]
            )

        case "circuit_updated":
            // Admin edited the active circuit's GPS finish-line points.
            // Forward as a NotificationCenter event so DriverView can
            // re-run applyCircuitFinishLine() without waiting for the
            // next foreground resume.
            print("[RaceVM] circuit_updated")
            let payload = (json["data"] as? [String: Any]) ?? [:]
            NotificationCenter.default.post(
                name: .circuitUpdated, object: nil, userInfo: payload
            )

        default:
            break
        }
    }

    private func parseKarts(_ data: [[String: Any]]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data)
            let decoder = JSONDecoder()
            let decoded = try decoder.decode([KartState].self, from: jsonData)
            karts = decoded.sorted { $0.position < $1.position }
            print("[RaceVM] Parsed \(karts.count) karts")
        } catch {
            print("[RaceVM] Failed to decode karts: \(error)")
        }
    }

    private func parseFifoScore(_ data: [String: Any]) {
        if let fifo = data["fifo"] as? [String: Any] {
            if let score = fifo["score"] as? Double {
                boxScore = score
            } else if let score = fifo["score"] as? Int {
                boxScore = Double(score)
            }
        }
    }

    private func applyUpdateEvent(_ event: [String: Any]) {
        let eventType = event["event"] as? String ?? ""

        // Global events (not kart-specific)
        switch eventType {
        case "countdown":
            if let ms = asDouble(event["ms"]) {
                recalibrateServerClock(ms)
            }
            return
        case "raceEnd":
            raceFinished = true
            raceTimerMs = 0
            countdownMs = 0
            return
        case "track":
            if let name = event["name"] as? String { sessionName = name }
            if let len = asDouble(event["circuitLengthM"]) { circuitLengthM = len }
            return
        default:
            break
        }

        // Kart-specific events: find kart by kartNumber or rowId
        let idx: Int?
        if let kartNumber = asInt(event["kartNumber"]) {
            idx = karts.firstIndex(where: { $0.kartNumber == kartNumber })
        } else if let rowId = event["rowId"] as? String {
            idx = karts.firstIndex(where: { $0.rowId == rowId })
        } else {
            return
        }
        guard let kartIdx = idx else { return }

        switch eventType {
        case "lap":
            if let lapMs = asDouble(event["lapTimeMs"]) {
                karts[kartIdx].lastLapMs = lapMs
                if karts[kartIdx].bestLapMs == nil || lapMs < (karts[kartIdx].bestLapMs ?? .infinity) {
                    karts[kartIdx].bestLapMs = lapMs
                }
            }
            if let total = asInt(event["totalLaps"]) {
                karts[kartIdx].totalLaps = total
            } else {
                karts[kartIdx].totalLaps += 1
            }
        case "bestLap":
            if let lapMs = asDouble(event["lapTimeMs"]) {
                karts[kartIdx].bestLapMs = lapMs
            }
        case "position":
            if let pos = asInt(event["position"]) { karts[kartIdx].position = pos }
        case "gap":
            if let val = event["value"] as? String { karts[kartIdx].gap = val }
        case "interval":
            if let val = event["value"] as? String { karts[kartIdx].interval = val }
        case "totalLaps":
            if let val = asInt(event["value"]) { karts[kartIdx].totalLaps = val }
        case "pitCount":
            if let val = asInt(event["value"]) { karts[kartIdx].pitCount = val }
        case "pitIn":
            karts[kartIdx].pitStatus = "in_pit"
            if let pc = asInt(event["pitCount"]) { karts[kartIdx].pitCount = pc }
            // Newer backends include pitInCountdownMs in the pitIn event.
            // Fall back to the currently-interpolated countdown so older
            // backends still get a working pit timer.
            if let cd = asDouble(event["pitInCountdownMs"]) {
                karts[kartIdx].pitInCountdownMs = cd
            } else {
                let interpolated = interpolatedClockMs(at: Date())
                if interpolated > 0 {
                    karts[kartIdx].pitInCountdownMs = interpolated
                }
            }
        case "pitOut":
            karts[kartIdx].pitStatus = "racing"
            if let pc = asInt(event["pitCount"]) { karts[kartIdx].pitCount = pc }
            if let cd = asDouble(event["stintStartCountdownMs"]) {
                karts[kartIdx].stintStartCountdownMs = cd
            }
            karts[kartIdx].pitInCountdownMs = nil
            karts[kartIdx].stintElapsedMs = 0
        case "driver":
            if let name = event["driverName"] as? String { karts[kartIdx].driverName = name }
        case "team":
            if let name = event["teamName"] as? String { karts[kartIdx].teamName = name }
        case "pitTime":
            break // display-only, not needed for calculations
        case "sector":
            // Per-kart sector update. The backend already sends a fresh
            // `sectorMeta` at the top of the same update message — that
            // refreshes the field-best leader. Here we update the kart's
            // own currentSNMs / bestSNMs so the live "Δ vs field-best"
            // card reflects the latest sector pass for this specific
            // pilot. Sector index is 1, 2, or 3 — the index in the
            // payload is the SECTOR index (resolved by the backend
            // from the grid's data-type), not the column index.
            guard let sectorIdx = asInt(event["sectorIdx"]),
                  let ms = asDouble(event["ms"]), ms > 0 else { break }
            switch sectorIdx {
            case 1:
                karts[kartIdx].currentS1Ms = ms
                if karts[kartIdx].bestS1Ms == nil || ms < (karts[kartIdx].bestS1Ms ?? .infinity) {
                    karts[kartIdx].bestS1Ms = ms
                }
            case 2:
                karts[kartIdx].currentS2Ms = ms
                if karts[kartIdx].bestS2Ms == nil || ms < (karts[kartIdx].bestS2Ms ?? .infinity) {
                    karts[kartIdx].bestS2Ms = ms
                }
            case 3:
                karts[kartIdx].currentS3Ms = ms
                if karts[kartIdx].bestS3Ms == nil || ms < (karts[kartIdx].bestS3Ms ?? .infinity) {
                    karts[kartIdx].bestS3Ms = ms
                }
            default: break
            }
        default:
            break
        }
    }

    /// Decode the `sectorMeta` payload (top-level field on snapshots and
    /// on update messages whose batch contained a sector event) into a
    /// strongly-typed `SectorMeta`. Returns nil when the backend reports
    /// `null` (circuit without sector telemetry) or the payload is
    /// malformed.
    private func decodeSectorMeta(_ raw: Any?) -> SectorMeta? {
        guard let dict = raw as? [String: Any?] else { return nil }
        func decode(_ key: String) -> SectorBest? {
            guard let inner = dict[key] as? [String: Any] else { return nil }
            guard let bestMs = asDouble(inner["bestMs"]),
                  let kartNumber = asInt(inner["kartNumber"]) else { return nil }
            return SectorBest(
                bestMs: bestMs,
                kartNumber: kartNumber,
                driverName: inner["driverName"] as? String,
                teamName: inner["teamName"] as? String,
                secondBestMs: asDouble(inner["secondBestMs"])
            )
        }
        let s1 = decode("s1"); let s2 = decode("s2"); let s3 = decode("s3")
        if s1 == nil && s2 == nil && s3 == nil { return nil }
        return SectorMeta(s1: s1, s2: s2, s3: s3)
    }

    // MARK: - JSON helpers (backend may send Int or Double)
    private func asDouble(_ value: Any?) -> Double? {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        return nil
    }

    private func asInt(_ value: Any?) -> Int? {
        if let i = value as? Int { return i }
        if let d = value as? Double { return Int(d) }
        return nil
    }
}
