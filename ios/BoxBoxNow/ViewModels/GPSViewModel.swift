import Foundation
import Combine

enum GPSSource: String, CaseIterable {
    case none = "none"
    case phone = "phone"
    case racebox = "racebox"

    /// Translation key — call sites do `t(src.i18nKey, lang.current)`.
    var i18nKey: String {
        switch self {
        case .none:    return "gps.sourceNone"
        case .phone:   return "gps.sourcePhone"
        case .racebox: return "gps.raceboxBle"
        }
    }

    /// Spanish fallback for non-translation-aware call sites.
    var displayName: String { t(i18nKey, .es) }
}

enum SignalQuality {
    case none, poor, fair, good, excellent

    /// Translation key — call sites do `t(quality.i18nKey, lang.current)`.
    var i18nKey: String {
        switch self {
        case .none:      return "gps.signalNone"
        case .poor:      return "gps.signalPoor"
        case .fair:      return "gps.signalFair"
        case .good:      return "gps.signalGood"
        case .excellent: return "gps.signalExcellent"
        }
    }

    /// Spanish fallback for non-translation-aware call sites.
    var displayName: String { t(i18nKey, .es) }
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
    private let imuCalibrator = ImuCalibrator()

    private var lastSampleTime: TimeInterval = 0
    private var sampleCount = 0

    init() {
        bleManager.onData = { [weak self] data in
            self?.ubxParser.feed(data)
        }
        ubxParser.onParsed = { [weak self] sample in
            self?.handleSample(sample)
        }
        phoneGPS.onSample = { [weak self] sample in
            self?.handleSample(sample)
        }

        let saved = UserDefaults.standard.string(forKey: Constants.Keys.gpsSource) ?? "none"
        source = GPSSource(rawValue: saved) ?? .none
    }

    func selectSource(_ src: GPSSource) {
        stopGPS()
        source = src
        UserDefaults.standard.set(src.rawValue, forKey: Constants.Keys.gpsSource)
        if src != .none { startGPS() }
    }

    func startGPS() {
        switch source {
        case .none: break
        case .phone:
            phoneGPS.requestPermission()
            phoneGPS.start()
            isConnected = true
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
        let calibrated = imuCalibrator.calibrate(sample: raw)
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

        // Sample rate
        let now = CACurrentMediaTime()
        if now - lastSampleTime < 2 { sampleCount += 1 }
        else { sampleRate = Double(sampleCount); sampleCount = 0 }
        lastSampleTime = now

        onSample?(calibrated)
    }
}
