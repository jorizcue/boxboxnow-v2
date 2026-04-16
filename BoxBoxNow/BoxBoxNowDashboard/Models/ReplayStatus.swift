import Foundation

struct ReplayStatus: Codable, Hashable {
    var active: Bool
    var filename: String?
    var progress: Double
    var speed: Double
    var paused: Bool
    /// Current block index (1-based) reported by the server replay engine.
    /// Optional — older server builds may omit it.
    var currentBlock: Int?
    /// Total block count in the currently-playing recording. Optional for
    /// the same reason as `currentBlock`.
    var totalBlocks: Int?
    /// ISO8601 timestamp of the current replay moment (e.g. original
    /// wall-clock time when the log line was recorded). Optional.
    var currentTime: String?

    static let idle = ReplayStatus(active: false, filename: nil, progress: 0, speed: 1, paused: false)
}
