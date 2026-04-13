import Foundation

final class UbxParser {
    var onParsed: ((GPSSample) -> Void)?

    private var buffer = Data()
    private let syncA: UInt8 = 0xB5
    private let syncB: UInt8 = 0x62

    func feed(_ data: Data) { buffer.append(data); parse() }
    func reset() { buffer.removeAll() }

    private func parse() {
        while buffer.count >= 8 {
            guard let syncIdx = findSync() else { buffer.removeAll(); return }
            if syncIdx > 0 { buffer = Data(buffer.dropFirst(syncIdx)) }
            guard buffer.count >= 6 else { return }

            let payloadLen = Int(buffer[4]) | (Int(buffer[5]) << 8)
            let total = 6 + payloadLen + 2
            guard buffer.count >= total else { return }

            let packet = Data(buffer.prefix(total))
            if verifyChecksum(packet) && buffer[2] == 0x01 && buffer[3] == 0x07 && payloadLen == 92 {
                if let sample = parseNavPvt(Data(packet[6..<(6 + payloadLen)])) {
                    onParsed?(sample)
                }
            }
            buffer = Data(buffer.dropFirst(total))
        }
    }

    private func findSync() -> Int? {
        for i in 0..<(buffer.count - 1) {
            if buffer[i] == syncA && buffer[i + 1] == syncB { return i }
        }
        return nil
    }

    private func verifyChecksum(_ p: Data) -> Bool {
        var a: UInt8 = 0, b: UInt8 = 0
        for i in 2..<(p.count - 2) { a = a &+ p[i]; b = b &+ a }
        return a == p[p.count - 2] && b == p[p.count - 1]
    }

    private func parseNavPvt(_ p: Data) -> GPSSample? {
        func i4(_ o: Int) -> Int32 { p.withUnsafeBytes { $0.load(fromByteOffset: o, as: Int32.self) } }
        func u1(_ o: Int) -> UInt8 { p[o] }

        let lon = Double(i4(24)) * 1e-7
        let lat = Double(i4(28)) * 1e-7
        let alt = Double(i4(36)) / 1000.0
        let spdMms = Double(i4(60))
        let hdg = Double(i4(64)) * 1e-5
        let spdKmh = abs(spdMms) / 1_000_000.0 * 3600.0

        return GPSSample(
            timestamp: CACurrentMediaTime(),
            lat: lat, lon: lon, altitudeM: alt, speedKmh: spdKmh, headingDeg: hdg,
            gForceX: 0, gForceY: 0, gForceZ: 0,
            fixType: Int(u1(20)), numSatellites: Int(u1(23)), batteryPercent: nil
        )
    }
}
