import Foundation

struct ReplayStatus: Codable, Hashable {
    var active: Bool
    var filename: String?
    var progress: Double
    var speed: Double
    var paused: Bool

    static let idle = ReplayStatus(active: false, filename: nil, progress: 0, speed: 1, paused: false)
}
