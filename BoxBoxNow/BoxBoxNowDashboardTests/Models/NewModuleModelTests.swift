import XCTest
@testable import BoxBoxNowDashboard

final class NewModuleModelTests: XCTestCase {

    // MARK: - GPSInsightModels

    func testGPSLapSummaryDecoding() throws {
        let json = """
        {"id":1,"circuit_id":2,"race_session_id":10,"lap_number":3,
         "duration_ms":58234.0,"total_distance_m":1245.6,
         "max_speed_kmh":87.3,"gps_source":"racebox",
         "recorded_at":"2025-04-10T14:30:00"}
        """.data(using: .utf8)!

        let lap = try JSONDecoder().decode(GPSLapSummary.self, from: json)
        XCTAssertEqual(lap.id, 1)
        XCTAssertEqual(lap.circuitId, 2)
        XCTAssertEqual(lap.raceSessionId, 10)
        XCTAssertEqual(lap.lapNumber, 3)
        XCTAssertEqual(lap.durationMs, 58234.0)
        XCTAssertEqual(lap.totalDistanceM, 1245.6)
        XCTAssertEqual(lap.maxSpeedKmh, 87.3)
        XCTAssertEqual(lap.gpsSource, "racebox")
        XCTAssertEqual(lap.recordedAt, "2025-04-10T14:30:00")
    }

    func testGPSLapSummaryDecodingMinimalFields() throws {
        let json = """
        {"id":5,"lap_number":1,"duration_ms":60000.0,"total_distance_m":800.0}
        """.data(using: .utf8)!

        let lap = try JSONDecoder().decode(GPSLapSummary.self, from: json)
        XCTAssertEqual(lap.id, 5)
        XCTAssertNil(lap.circuitId)
        XCTAssertNil(lap.raceSessionId)
        XCTAssertNil(lap.maxSpeedKmh)
        XCTAssertNil(lap.gpsSource)
        XCTAssertNil(lap.recordedAt)
    }

    func testGPSLapDetailDecoding() throws {
        let json = """
        {"id":1,"circuit_id":2,"lap_number":3,"duration_ms":58234.0,
         "total_distance_m":1245.6,"max_speed_kmh":87.3,
         "gps_source":"racebox","recorded_at":"2025-04-10T14:30:00",
         "distances":[0,100,200],"timestamps":[0,1000,2000],
         "positions":[{"lat":40.1,"lon":-3.5},{"lat":40.2,"lon":-3.6}],
         "speeds":[0,45.2,67.8],"gforce_lat":[0.0,0.3],"gforce_lon":[0.1,-0.5]}
        """.data(using: .utf8)!

        let lap = try JSONDecoder().decode(GPSLapDetail.self, from: json)
        XCTAssertEqual(lap.id, 1)
        XCTAssertEqual(lap.circuitId, 2)
        XCTAssertEqual(lap.lapNumber, 3)
        XCTAssertEqual(lap.durationMs, 58234.0)
        XCTAssertEqual(lap.positions?.count, 2)
        XCTAssertEqual(lap.speeds?.count, 3)
        XCTAssertEqual(lap.distances?.count, 3)
        XCTAssertEqual(lap.timestamps?.count, 3)
        XCTAssertEqual(lap.gforceLat?.count, 2)
        XCTAssertEqual(lap.gforceLon?.count, 2)
        XCTAssertEqual(lap.positions?.first?.lat, 40.1)
        XCTAssertEqual(lap.positions?.first?.lon, -3.5)
        XCTAssertEqual(lap.gforceLon?.last, -0.5)
    }

    func testGPSLapDetailDecodingWithoutTraces() throws {
        let json = """
        {"id":2,"lap_number":1,"duration_ms":70000.0,"total_distance_m":900.0}
        """.data(using: .utf8)!

        let lap = try JSONDecoder().decode(GPSLapDetail.self, from: json)
        XCTAssertEqual(lap.id, 2)
        XCTAssertNil(lap.positions)
        XCTAssertNil(lap.speeds)
        XCTAssertNil(lap.gforceLat)
        XCTAssertNil(lap.gforceLon)
    }

    func testGPSStatsDecoding() throws {
        let json = """
        {"total_laps":42,"best_lap_ms":58234.0,"avg_lap_ms":61000,
         "top_speed_kmh":87.3,"total_distance_km":125.4}
        """.data(using: .utf8)!

        let stats = try JSONDecoder().decode(GPSStats.self, from: json)
        XCTAssertEqual(stats.totalLaps, 42)
        XCTAssertEqual(stats.bestLapMs, 58234.0)
        XCTAssertEqual(stats.avgLapMs, 61000)
        XCTAssertEqual(stats.topSpeedKmh, 87.3)
        XCTAssertEqual(stats.totalDistanceKm, 125.4)
    }

    func testGPSPositionDecoding() throws {
        let json = """
        {"lat":40.4168,"lon":-3.7038}
        """.data(using: .utf8)!

        let pos = try JSONDecoder().decode(GPSPosition.self, from: json)
        XCTAssertEqual(pos.lat, 40.4168)
        XCTAssertEqual(pos.lon, -3.7038)
    }

    // MARK: - AnalyticsModels

    func testKartStatsDecoding() throws {
        let json = """
        {"kart_number":7,"races":12,"total_laps":150,"valid_laps":140,
         "avg_lap_ms":62000.0,"best5_avg_ms":59500.0,"best_lap_ms":58000,
         "teams":["Team A","Team B"]}
        """.data(using: .utf8)!

        let kart = try JSONDecoder().decode(KartStats.self, from: json)
        XCTAssertEqual(kart.kartNumber, 7)
        XCTAssertEqual(kart.races, 12)
        XCTAssertEqual(kart.totalLaps, 150)
        XCTAssertEqual(kart.validLaps, 140)
        XCTAssertEqual(kart.avgLapMs, 62000.0)
        XCTAssertEqual(kart.best5AvgMs, 59500.0)
        XCTAssertEqual(kart.bestLapMs, 58000)
        XCTAssertEqual(kart.teams.count, 2)
        XCTAssertEqual(kart.teams, ["Team A", "Team B"])
        XCTAssertEqual(kart.id, 7, "id should be derived from kartNumber")
    }

    func testKartBestLapDecoding() throws {
        let json = """
        {"lap_time_ms":58234,"lap_number":5,"team_name":"Team A",
         "driver_name":"Max","race_date":"2025-04-10","recorded_at":"2025-04-10T14:30:00"}
        """.data(using: .utf8)!

        let lap = try JSONDecoder().decode(KartBestLap.self, from: json)
        XCTAssertEqual(lap.lapTimeMs, 58234)
        XCTAssertEqual(lap.lapNumber, 5)
        XCTAssertEqual(lap.teamName, "Team A")
        XCTAssertEqual(lap.driverName, "Max")
        XCTAssertEqual(lap.raceDate, "2025-04-10")
        XCTAssertEqual(lap.recordedAt, "2025-04-10T14:30:00")
    }

    func testKartDriverDecoding() throws {
        let json = """
        {"team_name":"Scuderia","driver_name":"Carlos","display_name":"Carlos S.",
         "total_laps":80,"avg_lap_ms":61500.0,"best_lap_ms":59200}
        """.data(using: .utf8)!

        let driver = try JSONDecoder().decode(KartDriver.self, from: json)
        XCTAssertEqual(driver.teamName, "Scuderia")
        XCTAssertEqual(driver.driverName, "Carlos")
        XCTAssertEqual(driver.displayName, "Carlos S.")
        XCTAssertEqual(driver.totalLaps, 80)
        XCTAssertEqual(driver.avgLapMs, 61500.0)
        XCTAssertEqual(driver.bestLapMs, 59200)
        XCTAssertEqual(driver.id, "Scuderia-Carlos")
    }

    // MARK: - AdminHubModels

    func testHubCircuitStatusDecoding() throws {
        let json = """
        {"circuit_id":1,"circuit_name":"Madrid","connected":true,
         "subscribers":5,"messages":1234,"ws_url":"wss://example.com",
         "connected_users":[{"id":1,"username":"admin"}]}
        """.data(using: .utf8)!

        let status = try JSONDecoder().decode(HubCircuitStatus.self, from: json)
        XCTAssertEqual(status.circuitId, 1)
        XCTAssertEqual(status.circuitName, "Madrid")
        XCTAssertTrue(status.connected)
        XCTAssertEqual(status.subscribers, 5)
        XCTAssertEqual(status.messages, 1234)
        XCTAssertEqual(status.wsUrl, "wss://example.com")
        XCTAssertEqual(status.connectedUsers.count, 1)
        XCTAssertEqual(status.connectedUsers.first?.id, 1)
        XCTAssertEqual(status.connectedUsers.first?.username, "admin")
        XCTAssertEqual(status.id, 1, "id should be derived from circuitId")
    }

    func testHubConnectedUserDecoding() throws {
        let json = """
        {"id":42,"username":"operator"}
        """.data(using: .utf8)!

        let user = try JSONDecoder().decode(HubConnectedUser.self, from: json)
        XCTAssertEqual(user.id, 42)
        XCTAssertEqual(user.username, "operator")
    }

    func testHubStatusResponseDecoding() throws {
        let json = """
        {"circuits":[
            {"circuit_id":1,"circuit_name":"Madrid","connected":true,
             "subscribers":5,"messages":1234,"ws_url":"wss://example.com",
             "connected_users":[]},
            {"circuit_id":2,"circuit_name":"Barcelona","connected":false,
             "subscribers":0,"messages":0,"ws_url":"wss://example2.com",
             "connected_users":[]}
        ]}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(HubStatusResponse.self, from: json)
        XCTAssertEqual(response.circuits.count, 2)
        XCTAssertEqual(response.circuits[0].circuitName, "Madrid")
        XCTAssertTrue(response.circuits[0].connected)
        XCTAssertEqual(response.circuits[1].circuitName, "Barcelona")
        XCTAssertFalse(response.circuits[1].connected)
    }

    func testHubStatusResponseEmptyCircuits() throws {
        let json = """
        {"circuits":[]}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(HubStatusResponse.self, from: json)
        XCTAssertTrue(response.circuits.isEmpty)
    }

    // MARK: - UserListItem

    func testUserListItemDecoding() throws {
        let json = """
        {"id":1,"username":"admin","email":"a@b.com","is_admin":true,
         "tab_access":["race","pit"],"has_active_subscription":true,
         "subscription_plan":"pro","max_devices":3,"mfa_enabled":false,
         "created_at":"2025-01-01T00:00:00"}
        """.data(using: .utf8)!

        let user = try JSONDecoder().decode(UserListItem.self, from: json)
        XCTAssertEqual(user.id, 1)
        XCTAssertEqual(user.username, "admin")
        XCTAssertEqual(user.email, "a@b.com")
        XCTAssertTrue(user.isAdmin)
        XCTAssertEqual(user.tabAccess?.count, 2)
        XCTAssertEqual(user.tabAccess, ["race", "pit"])
        XCTAssertEqual(user.hasActiveSubscription, true)
        XCTAssertEqual(user.subscriptionPlan, "pro")
        XCTAssertEqual(user.maxDevices, 3)
        XCTAssertEqual(user.mfaEnabled, false)
        XCTAssertEqual(user.createdAt, "2025-01-01T00:00:00")
    }

    func testUserListItemDecodingMinimalFields() throws {
        let json = """
        {"id":2,"username":"viewer","is_admin":false}
        """.data(using: .utf8)!

        let user = try JSONDecoder().decode(UserListItem.self, from: json)
        XCTAssertEqual(user.id, 2)
        XCTAssertEqual(user.username, "viewer")
        XCTAssertFalse(user.isAdmin)
        XCTAssertNil(user.email)
        XCTAssertNil(user.tabAccess)
        XCTAssertNil(user.hasActiveSubscription)
        XCTAssertNil(user.subscriptionPlan)
        XCTAssertNil(user.maxDevices)
        XCTAssertNil(user.mfaEnabled)
        XCTAssertNil(user.createdAt)
    }
}
