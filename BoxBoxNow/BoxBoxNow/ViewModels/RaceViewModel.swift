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

    /// Fired when the authenticated user changes (logout, full sign-out,
    /// or a different user logs in on the same device). DriverViewModel
    /// listens for this to wipe its in-memory state — without it the
    /// previously-loaded visibleCards / cardOrder / brightness keep
    /// rendering for the new user even after UserDefaults is cleared.
    static let userAccountChanged = Notification.Name("userAccountChanged")
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
    @Published var teamDriversCount: Int = 0

    /// Pit-gate decision pushed by the backend on every snapshot /
    /// analytics / fifo_update. Combines regulation windows, stint
    /// length feasibility AND driver-min-time feasibility into one
    /// is_open/closed verdict + reason. nil while the very first frame
    /// hasn't arrived yet — views fall back to the legacy local check.
    @Published var pitStatus: PitStatus? = nil

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
    /// Parse an Apex gap/interval string to seconds. Apex shapes:
    ///   "" / nil        → nil (leader / no data)
    ///   "0.793"         → 0.793
    ///   "1:05.279"      → 65.279  (M:SS.fff)
    ///   "1 Tour" / "1L" → nil     (laps-down marker, not a same-lap gap)
    func apexSeconds(_ raw: String?) -> Double? {
        let s = (raw ?? "").trimmingCharacters(in: .whitespaces)
        if s.isEmpty { return nil }
        if s.contains(":") {
            let parts = s.split(separator: ":")
            guard parts.count >= 2,
                  let m = Double(parts[0].trimmingCharacters(in: .whitespaces)),
                  let sec = Double(parts[1].trimmingCharacters(in: .whitespaces))
            else { return nil }
            return m * 60 + sec
        }
        return Double(s)
    }

    /// Apex sends the `interval` (int) column for a whole session or
    /// not at all. True when ANY kart carries a non-empty interval.
    func sessionHasInterval() -> Bool {
        karts.contains { !($0.interval ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
    }

    /// Live classification order. The Apex `position` column only
    /// refreshes on RANKING events (lap-line crossings) so it lags —
    /// ordering by gap-to-leader instead updates on every gap event,
    /// which is why the "behind"/ApexPosition cards used to freeze
    /// until a position change. Key: leader (no gap)=0, numeric gap=
    /// seconds, laps-down=large sentinel; stable tiebreak by the
    /// (lagging) position then kart number so early-race (no gaps yet)
    /// still has a deterministic order.
    private func apexOrder() -> [KartState] {
        func key(_ k: KartState) -> Double {
            let g = (k.gap ?? "").trimmingCharacters(in: .whitespaces)
            if g.isEmpty { return 0 }                         // leader
            if let s = apexSeconds(g) { return s }            // same-lap gap
            let laps = Double(g.prefix { $0.isNumber }) ?? 1  // laps-down
            return 1_000_000 + laps * 1_000
        }
        return karts.filter { $0.position > 0 }.sorted {
            let ka = key($0), kb = key($1)
            if ka != kb { return ka < kb }
            if $0.position != $1.position { return $0.position < $1.position }
            return $0.kartNumber < $1.kartNumber
        }
    }

    /// Raw Apex live timing position, but ordered by the CONTINUOUS
    /// gap-to-leader classification (see `apexOrder`) so it tracks the
    /// visible board live instead of lagging until the next RANKING
    /// event. `total` = karts with a position assigned (unchanged).
    func apexPosition(ourKartNumber: Int) -> (pos: Int, total: Int)? {
        guard ourKartNumber > 0, !karts.isEmpty else { return nil }
        let order = apexOrder()
        guard let idx = order.firstIndex(where: { $0.kartNumber == ourKartNumber }) else { return nil }
        return (pos: idx + 1, total: order.count)
    }

    /// Returns the kart at offset N from `ourKartNumber` in the live
    /// Apex classification order (gap-based, continuous). offset=-1 is
    /// the kart immediately ahead, +1 the kart immediately behind.
    /// `nil` when our kart isn't placed yet or the neighbor doesn't exist.
    func apexNeighbor(ourKartNumber: Int, offset: Int) -> KartState? {
        guard ourKartNumber > 0, !karts.isEmpty else { return nil }
        let order = apexOrder()
        guard let idx = order.firstIndex(where: { $0.kartNumber == ourKartNumber }) else { return nil }
        let target = idx + offset
        guard target >= 0, target < order.count else { return nil }
        return order[target]
    }

    /// "Interval to kart ahead" card value. Prefer the Apex `interval`
    /// column when the session has it (our own interval IS our gap to
    /// the kart ahead). Fallback when Apex sends no interval column:
    /// derive it from the `gap`-to-leader deltas (my.gap − ahead.gap),
    /// using the continuous classification order.
    func intervalAheadDisplay(ourKartNumber: Int, leaderLabel: String) -> String {
        let mine = karts.first(where: { $0.kartNumber == ourKartNumber })
        guard let ahead = apexNeighbor(ourKartNumber: ourKartNumber, offset: -1) else {
            return leaderLabel  // we lead
        }
        if sessionHasInterval() {
            return formatApexInterval(mine?.interval, leaderSentinel: leaderLabel)
        }
        let my = apexSeconds(mine?.gap) ?? 0                  // leader gap = 0
        guard let a = apexSeconds(ahead.gap) else {
            return formatApexInterval(mine?.gap, leaderSentinel: leaderLabel)
        }
        return String(format: "%.3fs", max(0, my - a))
    }

    /// "Interval to kart behind" card value. The kart behind is found
    /// via the continuous classification order (fixes the freeze until
    /// a RANKING event). With an interval column, that kart's own
    /// `interval` IS its gap to me; without one, derive behind.gap −
    /// my.gap from the gap-to-leader deltas.
    func intervalBehindDisplay(ourKartNumber: Int) -> String {
        let mine = karts.first(where: { $0.kartNumber == ourKartNumber })
        guard let behind = apexNeighbor(ourKartNumber: ourKartNumber, offset: 1) else {
            return "—"
        }
        if sessionHasInterval() {
            return formatApexInterval(behind.interval, leaderSentinel: "—")
        }
        let my = apexSeconds(mine?.gap) ?? 0
        guard let b = apexSeconds(behind.gap) else { return "—" }
        return String(format: "%.3fs", max(0, b - my))
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

    /// Result of computing the sector delta vs the field-best for a
    /// given sector. `deltaMs` is signed: negative when the local
    /// pilot leads the sector (= my best minus the runner-up's best,
    /// so I'm faster), positive when trailing (= my latest pass minus
    /// the field's best, so I'm slower). `isMine` flags the leader
    /// case so the renderer can pick the right color and sign label
    /// without re-running the same comparison.
    struct SectorDelta {
        let deltaMs: Double
        let isMine: Bool
    }

    /// Pure cálculo del delta vs field-best para un sector concreto.
    /// Centralized so the per-sector cards (`deltaBestS1/2/3`) and the
    /// combined `deltaSectors` card don't duplicate the formula. Returns
    /// `nil` when sectors aren't available for the active session, the
    /// kart isn't on track yet, the field-best for the sector is empty,
    /// or the local pilot doesn't have data for the sector yet.
    func sectorDelta(ourKartNumber: Int, sectorIdx: Int) -> SectorDelta? {
        guard hasSectors,
              let leader = sectorMeta?.best(for: sectorIdx),
              let kart = karts.first(where: { $0.kartNumber == ourKartNumber })
        else { return nil }

        let myCurrent: Double?
        let myBest: Double?
        switch sectorIdx {
        case 1: myCurrent = kart.currentS1Ms; myBest = kart.bestS1Ms
        case 2: myCurrent = kart.currentS2Ms; myBest = kart.bestS2Ms
        case 3: myCurrent = kart.currentS3Ms; myBest = kart.bestS3Ms
        default: return nil
        }

        let isMine = (kart.kartNumber == leader.kartNumber)
        if isMine {
            // Margin off MY best (stable across the session). When the
            // runner-up hasn't logged a sector yet, render 0 — still
            // green, conveys "leader without anyone close enough to
            // measure".
            guard let myB = myBest, myB > 0 else { return SectorDelta(deltaMs: 0, isMine: true) }
            guard let second = leader.secondBestMs, second > 0 else {
                return SectorDelta(deltaMs: 0, isMine: true)
            }
            return SectorDelta(deltaMs: myB - second, isMine: true)
        } else {
            // Deficit uses CURRENT (latest pass) so the value reacts
            // to each sector crossing.
            guard let cur = myCurrent, cur > 0 else { return nil }
            return SectorDelta(deltaMs: cur - leader.bestMs, isMine: false)
        }
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
        // Authoritative source is the backend's pit_gate result. When the
        // WS has pushed a pitStatus we trust it — it already considers
        // regulation windows, stint-length bounds AND the new driver-min-
        // time feasibility check (see backend/app/engine/pit_gate.py).
        if let status = pitStatus {
            return status.isOpen
        }

        // Fallback: the legacy local heuristic, used when the very first
        // WS frame hasn't arrived yet or when talking to an older backend
        // that doesn't emit pitStatus.
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
                    teamDriversCount = asInt(cfg["teamDriversCount"]) ?? teamDriversCount
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
                // Pit-gate decision (server-side authoritative). Only
                // overwrite when the key is present, same logic as
                // sectors — guards against analytics frames that omit
                // it on older backends.
                if snapshotData.keys.contains("pitStatus") {
                    pitStatus = decodePitStatus(snapshotData["pitStatus"])
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
                // Backend bundles the recomputed pit-gate state on every
                // fifo_update so the badge reacts immediately to a pit-in
                // shifting driver totals. Same guard as elsewhere: only
                // overwrite when the key is actually present so older
                // backends keep working.
                if msgData.keys.contains("pitStatus") {
                    pitStatus = decodePitStatus(msgData["pitStatus"])
                }
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

    /// Decode the `pitStatus` payload (top-level field on snapshots,
    /// analytics frames and fifo_update messages) into a strongly-typed
    /// `PitStatus`. Returns nil when the backend reports `null` or the
    /// payload is malformed; callers fall back to the prior local
    /// pit-window heuristic in that case.
    private func decodePitStatus(_ raw: Any?) -> PitStatus? {
        guard let dict = raw as? [String: Any] else { return nil }
        let isOpen = (dict["is_open"] as? Bool) ?? true
        let closeReason = dict["close_reason"] as? String
        let blockingDriver = dict["blocking_driver"] as? String
        let blockingRem = asInt(dict["blocking_driver_remaining_ms"])
        let nextOpen = asInt(dict["next_open_countdown_ms"])
        var drivers: [PitStatus.DriverTimeInfo] = []
        if let arr = dict["drivers"] as? [[String: Any]] {
            for d in arr {
                let name = (d["name"] as? String) ?? ""
                let acc = asInt(d["accumulated_ms"]) ?? 0
                let rem = asInt(d["remaining_ms"]) ?? 0
                drivers.append(.init(name: name, accumulatedMs: acc, remainingMs: rem))
            }
        }
        return PitStatus(
            isOpen: isOpen,
            closeReason: closeReason,
            blockingDriver: blockingDriver,
            blockingDriverRemainingMs: blockingRem,
            nextOpenCountdownMs: nextOpen,
            drivers: drivers
        )
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
