import XCTest

final class BoxBoxNowDashboardUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Smoke test: verify the app launches without crashing.
    /// The login screen should appear since no stored credentials exist.
    func testAppLaunches() throws {
        let app = XCUIApplication()
        app.launch()
        // The app should show the auth flow (login screen)
        // Just verifying it doesn't crash on launch
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
    }
}
