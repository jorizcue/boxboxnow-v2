import Foundation
import CoreLocation
import CoreMotion
import Combine

final class PhoneGPSManager: NSObject, ObservableObject {
    @Published var currentLocation: CLLocation?
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var isUpdating = false

    var onSample: ((GPSSample) -> Void)?

    private let locationManager = CLLocationManager()
    private let motionManager = CMMotionManager()
    private var lastAccel: CMAccelerometerData?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = kCLDistanceFilterNone
    }

    func requestPermission() { locationManager.requestWhenInUseAuthorization() }

    func start() {
        locationManager.startUpdatingLocation()
        if motionManager.isAccelerometerAvailable {
            motionManager.accelerometerUpdateInterval = 0.1
            motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
                self?.lastAccel = data
            }
        }
        isUpdating = true
    }

    func stop() {
        locationManager.stopUpdatingLocation()
        motionManager.stopAccelerometerUpdates()
        isUpdating = false
    }
}

extension PhoneGPSManager: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        currentLocation = loc
        let accel = lastAccel
        let sample = GPSSample(
            timestamp: CACurrentMediaTime(),
            lat: loc.coordinate.latitude,
            lon: loc.coordinate.longitude,
            altitudeM: loc.altitude,
            speedKmh: max(0, loc.speed * 3.6),
            headingDeg: loc.course >= 0 ? loc.course : 0,
            gForceX: (accel?.acceleration.x ?? 0),
            gForceY: (accel?.acceleration.y ?? 0),
            gForceZ: (accel?.acceleration.z ?? 0),
            fixType: loc.horizontalAccuracy > 0 ? 3 : 0,
            numSatellites: 0,
            batteryPercent: nil
        )
        onSample?(sample)
    }
}
