import Foundation
import Combine

final class ConfigViewModel: ObservableObject {
    @Published var circuitId: Int?
    @Published var sessionName: String
    @Published var totalLaps: Int?
    @Published var totalMinutes: Int?
    @Published var kartCount: Int

    private let defaults = UserDefaults.standard

    init() {
        let cid = defaults.integer(forKey: Constants.Keys.circuitId)
        circuitId = cid > 0 ? cid : nil
        sessionName = defaults.string(forKey: Constants.Keys.sessionName) ?? ""
        totalLaps = nil
        totalMinutes = nil
        kartCount = 10
    }

    func save() {
        if let cid = circuitId { defaults.set(cid, forKey: Constants.Keys.circuitId) }
        defaults.set(sessionName, forKey: Constants.Keys.sessionName)
    }
}
