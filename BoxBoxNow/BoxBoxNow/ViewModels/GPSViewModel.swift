import Foundation
import Combine
import QuartzCore

enum GPSSource: String, CaseIterable {
    case none = "none"
    case phone = "phone"
    case racebox = "racebox"

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

    private var lastSampleTime: TimeInterval = 0
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
        phoneGPS.onSample = { [weak self] sample in
            self?.handleSample(sample)
        }

        let saved = UserDefaults.standard.string(forKey: Constants.Keys.gpsSource) ?? "none"
        source = GPSSource(rawValue: saved) ?? .none
        // Auto-start GPS on launch if a source was previously selected
        if source != .none { startGPS() }
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

        // Sample rate
        let now = CACurrentMediaTime()
        if now - lastSampleTime < 2 { sampleCount += 1 }
        else { sampleRate = Double(sampleCount); sampleCount = 0 }
        lastSampleTime = now

        onSample?(calibrated)
    }
}
