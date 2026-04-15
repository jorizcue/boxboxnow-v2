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
            XCTAssertEqual(req.url?.path, "/api/race/reset")
            XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/json")
            // Body must round-trip through the Encodable path — pins that we're
            // encoding with JSONEncoder and not sending an empty payload.
            let bodyData = try XCTUnwrap(MockURLProtocol.body(of: req))
            let sent = try JSONDecoder().decode(Echo.self, from: bodyData)
            XCTAssertEqual(sent, Echo(ok: true, n: 0))
            let reply = try JSONEncoder().encode(Echo(ok: true, n: 42))
            return (200, reply, nil)
        }
        let reply: Echo = try await APIClient.shared.postJSON("/race/reset", body: Echo(ok: true, n: 0))
        XCTAssertEqual(reply.n, 42)
    }

    func testPatchJSONEncodable() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.httpMethod, "PATCH")
            XCTAssertEqual(req.url?.path, "/api/config/preferences")
            XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let bodyData = try XCTUnwrap(MockURLProtocol.body(of: req))
            let sent = try JSONDecoder().decode(Echo.self, from: bodyData)
            XCTAssertEqual(sent, Echo(ok: true, n: 0))
            let reply = try JSONEncoder().encode(Echo(ok: true, n: 9))
            return (200, reply, nil)
        }
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
        // Seed a token so the outgoing request gets an Authorization header.
        // handleStatus only fires .authExpired for authenticated 401s.
        KeychainHelper.saveToken("dummy-test-token")
        defer { KeychainHelper.deleteToken() }

        MockURLProtocol.handler = { _ in (401, Data(), nil) }
        let exp = expectation(forNotification: .authExpired, object: nil)
        do {
            let _: Echo = try await APIClient.shared.getJSON("/auth/me")
            XCTFail("expected throw")
        } catch APIError.unauthorized {
            // expected
        } catch {
            XCTFail("expected APIError.unauthorized, got \(error)")
        }
        await fulfillment(of: [exp], timeout: 1)
    }

    /// Pins the Fix 1 semantics: an unauthenticated 401 (e.g. bad-password on
    /// /auth/login) must still throw .unauthorized but must NOT post
    /// .authExpired — otherwise Task 14's auth subscriber would yank the user
    /// back to the login screen from the login screen itself.
    func testUnauthorizedOnUnauthenticatedRequestDoesNotFireNotification() async {
        // No token in keychain — request will go out without Authorization.
        KeychainHelper.deleteToken()

        MockURLProtocol.handler = { req in
            XCTAssertNil(req.value(forHTTPHeaderField: "Authorization"))
            return (401, Data(), nil)
        }

        var fired = false
        let observer = NotificationCenter.default.addObserver(forName: .authExpired, object: nil, queue: nil) { _ in
            fired = true
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        do {
            let _: Echo = try await APIClient.shared.getJSON("/auth/login")
            XCTFail("expected throw")
        } catch APIError.unauthorized {
            // expected
        } catch {
            XCTFail("expected APIError.unauthorized, got \(error)")
        }

        // Give any pending notification a runloop tick to fire.
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertFalse(fired, ".authExpired must NOT fire on unauthenticated 401")
    }
}
