import XCTest
@testable import BoxBoxNowDashboard

// Spec: verify the dashboard-only decoding extensions on shared models.
// The KartState extended-fields test ships in Task 5, alongside PitRecord
// and KartStateFull. This file covers the three extensions that have no
// Task 5 dependency.
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
        XCTAssertEqual(cfg.finishLat1 ?? 0, 40.1234, accuracy: 0.0001)
        XCTAssertEqual(cfg.finishLon2 ?? 0, -3.5679, accuracy: 0.0001)
    }

    func testCircuitDecodesExtendedFields() throws {
        let json = """
        {
          "id": 1, "name": "Jarama", "length_m": 1200,
          "finish_lat_1": 40.1234, "finish_lon_1": -3.5678,
          "finish_lat_2": 40.1235, "finish_lon_2": -3.5679,
          "is_active": true
        }
        """.data(using: .utf8)!
        let c = try JSONDecoder().decode(Circuit.self, from: json)
        XCTAssertEqual(c.lengthM, 1200)
        XCTAssertEqual(c.isActive, true)
        XCTAssertEqual(c.finishLat1 ?? 0, 40.1234, accuracy: 0.0001)
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
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let u = try decoder.decode(User.self, from: json)
        XCTAssertEqual(u.subscriptionStatus, "active")
        XCTAssertNotNil(u.createdAt)
    }
}
