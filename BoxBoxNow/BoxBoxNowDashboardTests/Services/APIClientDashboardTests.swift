import XCTest
@testable import BoxBoxNowDashboard

struct Echo: Codable, Equatable { let ok: Bool; let n: Int }

final class APIClientDashboardTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.handler = nil
        APIClient.shared.overrideURLSession = URLSession(configuration: MockURLProtocol.sessionConfiguration())
    }

    override func tearDown() {
        APIClient.shared.overrideURLSession = nil
        super.tearDown()
    }

    func testGetWithQuery() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.url?.path, "/api/race/snapshot")
            XCTAssertEqual(req.url?.query, "view=full")
            XCTAssertEqual(req.httpMethod, "GET")
            let body = try JSONEncoder().encode(Echo(ok: true, n: 1))
            return (200, body, nil)
        }
        let e: Echo = try await APIClient.shared.getJSON("/race/snapshot", query: [URLQueryItem(name: "view", value: "full")])
        XCTAssertEqual(e, Echo(ok: true, n: 1))
    }

    func testPostJSONEncodable() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.httpMethod, "POST")
            XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = try JSONEncoder().encode(Echo(ok: true, n: 42))
            return (200, body, nil)
        }
        let reply: Echo = try await APIClient.shared.postJSON("/race/reset", body: Echo(ok: true, n: 0))
        XCTAssertEqual(reply.n, 42)
    }

    func testPatchJSONEncodable() async throws {
        MockURLProtocol.handler = { _ in (200, try JSONEncoder().encode(Echo(ok: true, n: 9)), nil) }
        let reply: Echo = try await APIClient.shared.patchJSON("/config/preferences", body: Echo(ok: true, n: 0))
        XCTAssertEqual(reply.n, 9)
    }

    func testDelete() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.httpMethod, "DELETE")
            return (204, Data(), nil)
        }
        try await APIClient.shared.deleteJSON("/auth/sessions/42")
    }

    func testUnauthorizedFires401Notification() async {
        MockURLProtocol.handler = { _ in (401, Data(), nil) }
        let exp = expectation(forNotification: .authExpired, object: nil)
        do {
            let _: Echo = try await APIClient.shared.getJSON("/auth/me")
            XCTFail("expected throw")
        } catch { /* ok */ }
        await fulfillment(of: [exp], timeout: 1)
    }
}
