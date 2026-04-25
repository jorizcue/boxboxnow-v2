import Foundation
import Combine
import QuartzCore

enum GPSSource: String, CaseIterable {
    case none = "none"
    case phone = "phone"          // legacy — never selected by the app, kept for migration
    case racebox = "racebox"

    /// Sources the user is allowed to pick from the UI. `.phone` is hidden
    /// because the project requires RaceBox-only telemetry (the phone's GPS
    /// caps at ~10Hz and pollutes the LapTracker if both run at once).
    static var selectable: [GPSSource] { [.none, .racebox] }

    var displayName: String {
        switch self {
        case .none: return "Ninguno"
        case .phone: return "Telefono"
        case .racebox: return "RaceBox BLE"
        }
    }
}

enum SignalQuality {
    case none, poor, fair, good, excellent

    var displayName: String {
        switch self {
        case .none: return "Sin senal"
        case .poor: return "Debil"
        case .fair: return "Aceptable"
        case .good: return "Buena"
        case .excellent: return "Excelente"
        }
    }
}

final class GPSViewModel: ObservableObject {
    @Published var source: GPSSource = .none
    @Published var isConnected = false
    @Published var signalQuality: SignalQuality = .none
    @Published var sampleRate: Double = 0
    @Published var lastSample: GPSSample?

    var onSample: ((GPSSample) -> Void)?

    let bleManager = BLEManager()
    let phoneGPS = PhoneGPSManager()
    private let ubxParser = UbxParser()
    let calibrator = ImuCalibrator()

    // Sample-rate gauge: counts arrivals within a 1-second window and
    // updates `sampleRate` (in Hz) when the window closes.
    private var sampleWindowStart: TimeInterval = 0
    private var sampleCount = 0
    private var calibratorSink: AnyCancellable?
    private var bleSink: AnyCancellable?

    init() {
        // Forward calibrator changes so SwiftUI views update
        calibratorSink = calibrator.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }

        // Forward BLEManager changes too — otherwise discoveredDevices /
        // isScanning updates fire bleManager.objectWillChange but the views
        // bind to gpsVM, so the scanning list never refreshes and the pilot
        // sees "Buscando dispositivos..." forever.
        bleSink = bleManager.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }

        bleManager.onData = { [weak self] data in
            self?.ubxParser.feed(data)
        }
        ubxParser.onParsed = { [weak self] sample in
            self?.handleSample(sample)
        }
        // PhoneGPS wire-up intentionally removed: the project is RaceBox-only.
        // Leaving phoneGPS.onSample disconnected guarantees that if any
        // legacy code path accidentally calls `phoneGPS.start()`, its samples
        // can never reach the LapTracker.

        // Force RaceBox on every launch — ignore any previously saved
        // GpsSource (e.g. an older build that stored "phone" in UserDefaults).
        source = .racebox
        UserDefaults.standard.set(GPSSource.racebox.rawValue, forKey: Constants.Keys.gpsSource)
        startGPS()
    }

    func selectSource(_ src: GPSSource) {
        // App is RaceBox-only. Reject `.phone` requests (legacy preference,
        // UI shouldn't expose it anyway).
        let resolved: GPSSource = (src == .phone) ? .racebox : src
        stopGPS()
        source = resolved
        UserDefaults.standard.set(resolved.rawValue, forKey: Constants.Keys.gpsSource)
        if resolved != .none { startGPS() }
    }

    func startGPS() {
        switch source {
        case .none: break
        case .phone:
            // Defensive no-op: phone GPS is never used. If the saved
            // preference is somehow `.phone`, treat it as RaceBox.
            source = .racebox
            bleManager.startScan()
        case .racebox:
            bleManager.startScan()
        }
    }

    func stopGPS() {
        phoneGPS.stop()
        bleManager.disconnect()
        bleManager.stopScan()
        isConnected = false
        signalQuality = .none
    }

    private func handleSample(_ raw: GPSSample) {
        // RaceBox-only guard. RaceBox samples carry `batteryPercent`; the
        // PhoneGPSManager always emits nil. If a phone sample sneaks in via
        // some unintended path, drop it before it reaches the LapTracker.
        guard raw.batteryPercent != nil else { return }

        let calibrated = calibrator.calibrate(sample: raw)
        lastSample = calibrated
        isConnected = true

        // Compute signal quality
        switch calibrated.numSatellites {
        case 0: signalQuality = .none
        case 1...4: signalQuality = .poor
        case 5...7: signalQuality = .fair
        case 8...11: signalQuality = .good
        default: signalQuality = .excellent
        }

        // Sample rate (Hz) over a fixed 1-second window. The previous
        // implementation was buggy: it compared `now - lastSampleTime` to 2s,
        // but `lastSampleTime` was updated every sample, so the gap was
        // always ~20ms and the `else` branch (where sampleRate is assigned)
        // never fired during normal operation.
        let now = CACurrentMediaTime()
        sampleCount += 1
        if sampleWindowStart == 0 {
            sampleWindowStart = now
        } else {
            let elapsed = now - sampleWindowStart
            if elapsed >= 1.0 {
                sampleRate = Double(sampleCount) / elapsed
                sampleCount = 0
                sampleWindowStart = now
            }
        }

        onSample?(calibrated)
    }
}
