import Foundation
import XCTest

enum FixtureLoader {
    static func load(_ name: String, ext: String = "json", in cls: AnyClass) throws -> Data {
        guard let url = Bundle(for: cls).url(forResource: name, withExtension: ext) else {
            throw NSError(domain: "FixtureLoader", code: 404, userInfo: [NSLocalizedDescriptionKey: "Missing fixture \(name).\(ext)"])
        }
        return try Data(contentsOf: url)
    }

    static func decode<T: Decodable>(_ type: T.Type, from name: String, in cls: AnyClass) throws -> T {
        let data = try load(name, in: cls)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
