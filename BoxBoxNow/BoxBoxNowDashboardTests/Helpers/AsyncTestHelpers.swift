import Foundation
import XCTest

@MainActor
enum AsyncTestHelpers {
    static func waitUntil(
        timeout: TimeInterval,
        pollInterval: TimeInterval = 0.02,
        check: @MainActor () -> Bool,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if check() { return }
            try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
        }
        XCTFail("timeout waiting for condition", file: file, line: line)
    }
}
