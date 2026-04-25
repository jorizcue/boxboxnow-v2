import XCTest
@testable import BoxBoxNowDashboard

// Spec: verify the dashboard-only decoding extensions on shared models.
final class SharedModelExtensionsTests: XCTestCase {
    func testRaceConfigDecodesExtendedFields() throws {
        let json = """
        {
          "circuitLengthM": 1200,
          "pitTimeS": 180,
          "ourKartNumber": 7,
          "minPits": 2,
          "maxStintMin": 35,
          "minStintMin": 5,
          "durationMin": 120,
          "boxLines": 2,
          "boxKarts": 4,
          "minDriverTimeMin": 60,
          "pitClosedStartMin": 5,
          "pitClosedEndMin": 5,
          "rain": false,
          "finishLat1": 40.1234,
          "finishLon1": -3.5678,
          "finishLat2": 40.1235,
          "finishLon2": -3.5679
        }
        """.data(using: .utf8)!
        let cfg = try JSONDecoder().decode(RaceConfig.self, from: json)
        XCTAssertEqual(cfg.boxLines, 2)
        XCTAssertEqual(cfg.pitClosedStartMin, 5)
        let lat1 = try XCTUnwrap(cfg.finishLat1)
        let lon2 = try XCTUnwrap(cfg.finishLon2)
        XCTAssertEqual(lat1, 40.1234, accuracy: 0.0001)
        XCTAssertEqual(lon2, -3.5679, accuracy: 0.0001)
    }

    func testCircuitDecodesExtendedFields() throws {
        // Backend's CircuitOut serializes the GPS finish line keys without
        // an underscore between "lat"/"lon" and the index.
        let json = """
        {
          "id": 1, "name": "Jarama", "length_m": 1200,
          "finish_lat1": 40.1234, "finish_lon1": -3.5678,
          "finish_lat2": 40.1235, "finish_lon2": -3.5679,
          "is_active": true
        }
        """.data(using: .utf8)!
        let c = try JSONDecoder().decode(Circuit.self, from: json)
        XCTAssertEqual(c.lengthM, 1200)
        XCTAssertEqual(c.isActive, true)
        let lat1 = try XCTUnwrap(c.finishLat1)
        XCTAssertEqual(lat1, 40.1234, accuracy: 0.0001)
    }

    func testUserDecodesExtendedFields() throws {
        let json = """
        {
          "id": 42, "username": "ayrton", "email": "a@b.c",
          "is_admin": false, "mfa_enabled": true, "mfa_required": true,
          "tab_access": ["race","pit","live","config"],
          "has_active_subscription": true, "subscription_plan": "pro_annual",
          "subscription_status": "active", "created_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!
        // Use a bare JSONDecoder — APIClient.execute in the driver app decodes
        // User with no .iso8601 strategy, so createdAt must round-trip through
        // a plain JSONDecoder. If this ever regresses to Date?, the driver
        // app's /auth/me call will crash at runtime.
        let u = try JSONDecoder().decode(User.self, from: json)
        XCTAssertEqual(u.subscriptionStatus, "active")
        XCTAssertEqual(u.createdAt, "2026-01-01T00:00:00Z")
    }

    func testKartStateDecodesExtendedFields() throws {
        let url = Bundle(for: type(of: self)).url(forResource: "kart_state_extended", withExtension: "json")!
        let data = try Data(contentsOf: url)
        let kart = try JSONDecoder().decode(KartStateFull.self, from: data)

        XCTAssertEqual(kart.base.kartNumber, 1)
        XCTAssertEqual(kart.pitHistory.count, 1)
        XCTAssertEqual(kart.pitHistory.first?.pitNumber, 1)
        XCTAssertEqual(kart.driverTotalMs["Ayrton"], 3200000)
        XCTAssertEqual(kart.driverAvgLapMs["Ayrton"], 88500)
        XCTAssertEqual(kart.recentLaps.count, 2)
        XCTAssertEqual(kart.recentLaps.first?.lapTime, 88345)
    }
}
