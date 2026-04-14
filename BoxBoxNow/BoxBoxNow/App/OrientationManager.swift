import UIKit
import SwiftUI

/// Global orientation controller.
///
/// The OS asks the AppDelegate which orientations are supported on each
/// orientation change. We back that with a mutable mask that views (like
/// DriverView) can set when they appear.
///
/// Why the AppDelegate path: in pure SwiftUI there's no per-view
/// `supportedInterfaceOrientations` override, so we have to implement
/// `application(_:supportedInterfaceOrientationsFor:)` on an AppDelegate
/// and drive it from a singleton.
final class OrientationManager {
    static let shared = OrientationManager()
    private init() {}

    /// Current mask the AppDelegate will report.
    var mask: UIInterfaceOrientationMask = .all

    /// Apply a new mask and, on iOS 16+, request an immediate geometry update
    /// so the scene actually rotates to a supported orientation now (not only
    /// on the next device rotation).
    func lock(_ newMask: UIInterfaceOrientationMask) {
        mask = newMask

        if #available(iOS 16.0, *) {
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            else { return }
            let prefs = UIWindowScene.GeometryPreferences.iOS(interfaceOrientations: newMask)
            scene.requestGeometryUpdate(prefs) { _ in }
            scene.windows
                .first(where: { $0.isKeyWindow })?
                .rootViewController?
                .setNeedsUpdateOfSupportedInterfaceOrientations()
        } else {
            // Legacy path: nudge UIKit to re-query supported orientations
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }

    /// Convenience: free = allow all, portrait/landscape = lock.
    func apply(_ lock: OrientationLock) {
        switch lock {
        case .free:      self.lock(.all)
        case .portrait:  self.lock(.portrait)
        case .landscape: self.lock(.landscape)
        }
    }
}

/// AppDelegate whose only job is to report the current orientation mask.
final class BoxBoxNowAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        OrientationManager.shared.mask
    }
}
