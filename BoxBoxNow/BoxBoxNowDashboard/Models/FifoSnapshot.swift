import Foundation

struct FifoSnapshot: Codable, Hashable {
    var timestamp: Double
    var queue: [FifoEntry]
    var score: Double
}
