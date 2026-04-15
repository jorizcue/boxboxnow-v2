import Foundation

struct FifoState: Codable, Hashable {
    var queue: [FifoEntry]
    var score: Double
    var history: [FifoSnapshot]

    static let empty = FifoState(queue: [], score: 0, history: [])
}
