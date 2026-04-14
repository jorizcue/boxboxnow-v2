import Foundation
import QuartzCore

/// Parser for the RaceBox Mini UBX-like BLE data stream.
///
/// Protocol (matches `frontend/src/lib/racebox/ubxParser.ts`):
///   `0xB5 0x62 | class | id | lenL lenH | payload | CK_A CK_B`
/// RaceBox Data Message: class=0xFF, id=0x01, payload=80 bytes.
///
/// NOTE: this is the RaceBox proprietary message, NOT the standard
/// UBX-NAV-PVT (class=0x01, id=0x07, payload=92 bytes). The real device
/// only sends the 0xFF/0x01 message, so matching on anything else means
/// we never emit samples — which previously left the calibrator stuck
/// at 0% because gForce data never reached it.
final class UbxParser {
    var onParsed: ((GPSSample) -> Void)?

    private var buffer = Data()
    private let syncA: UInt8 = 0xB5
    private let syncB: UInt8 = 0x62
    private let raceboxClass: UInt8 = 0xFF
    private let raceboxDataId: UInt8 = 0x01
    private let expectedPayloadLen: Int = 80

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
            if verifyChecksum(packet)
                && buffer[2] == raceboxClass
                && buffer[3] == raceboxDataId
                && payloadLen == expectedPayloadLen {
                if let sample = parseRaceBoxData(Data(packet[6..<(6 + payloadLen)])) {
                    onParsed?(sample)
                }
            }
            buffer = Data(buffer.dropFirst(total))
        }
    }

    private func findSync() -> Int? {
        guard buffer.count >= 2 else { return nil }
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

    /// Parse the 80-byte RaceBox payload. Offsets mirror the web parser.
    private func parseRaceBoxData(_ p: Data) -> GPSSample? {
        guard p.count >= 80 else { return nil }

        // Read little-endian integers from the copied payload. We use a
        // local copy via withUnsafeBytes to avoid alignment surprises on
        // ARM when reading int32/int16 fields from arbitrary offsets.
        func i4(_ o: Int) -> Int32 {
            var v: Int32 = 0
            _ = withUnsafeMutableBytes(of: &v) { dst in
                p.withUnsafeBytes { src in
                    memcpy(dst.baseAddress!, src.baseAddress!.advanced(by: o), 4)
                }
            }
            return Int32(littleEndian: v)
        }
        func i2(_ o: Int) -> Int16 {
            var v: Int16 = 0
            _ = withUnsafeMutableBytes(of: &v) { dst in
                p.withUnsafeBytes { src in
                    memcpy(dst.baseAddress!, src.baseAddress!.advanced(by: o), 2)
                }
            }
            return Int16(littleEndian: v)
        }
        func u1(_ o: Int) -> UInt8 { p[o] }

        let fixType = Int(u1(20))
        let numSat = Int(u1(23))
        let lon = Double(i4(24)) * 1e-7
        let lat = Double(i4(28)) * 1e-7
        let alt = Double(i4(36)) / 1000.0          // mm → m
        let spdMms = Double(i4(48))                // mm/s (signed)
        let hdg = Double(i4(52)) * 1e-5            // deg
        let battery = Int(u1(67) & 0x7f)           // lower 7 bits
        let gfx = Double(i2(68)) / 1000.0          // milli-G → G
        let gfy = Double(i2(70)) / 1000.0
        let gfz = Double(i2(72)) / 1000.0

        let spdKmh = abs(spdMms) * 3.6 / 1000.0

        return GPSSample(
            timestamp: CACurrentMediaTime(),
            lat: lat, lon: lon, altitudeM: alt,
            speedKmh: spdKmh, headingDeg: hdg,
            gForceX: gfx, gForceY: gfy, gForceZ: gfz,
            fixType: fixType, numSatellites: numSat, batteryPercent: battery
        )
    }
}
