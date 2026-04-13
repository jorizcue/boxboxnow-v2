import Foundation
import Combine

final class ImuCalibrator: ObservableObject {
    enum Phase: Equatable {
        case idle, sampling, ready, aligned
    }

    struct Vec3 {
        var x, y, z: Double
        static let zero = Vec3(x: 0, y: 0, z: 0)
    }

    @Published var phase: Phase = .idle

    private var gravSamples: [Vec3] = []
    private var gravity: Vec3 = .zero
    private var rotationMatrix: [[Double]] = [[1,0,0],[0,1,0],[0,0,1]]
    private let requiredSamples = 50
    private let movingThreshold = 2.0 // km/h

    func startCalibration() {
        gravSamples.removeAll()
        phase = .sampling
    }

    func reset() {
        phase = .idle
        gravSamples.removeAll()
        gravity = .zero
        rotationMatrix = [[1,0,0],[0,1,0],[0,0,1]]
    }

    func calibrate(sample: GPSSample) -> GPSSample {
        var s = sample
        switch phase {
        case .idle:
            return s
        case .sampling:
            gravSamples.append(Vec3(x: s.gForceX, y: s.gForceY, z: s.gForceZ))
            if gravSamples.count >= requiredSamples {
                computeGravity()
                phase = .ready
            }
            return s
        case .ready:
            if s.speedKmh > movingThreshold {
                computeAlignment(sample: s)
                phase = .aligned
            }
            s.gForceX -= gravity.x
            s.gForceY -= gravity.y
            s.gForceZ -= gravity.z
            return s
        case .aligned:
            let raw = Vec3(x: s.gForceX - gravity.x, y: s.gForceY - gravity.y, z: s.gForceZ - gravity.z)
            let rotated = applyRotation(raw)
            s.gForceX = rotated.x
            s.gForceY = rotated.y
            s.gForceZ = rotated.z
            return s
        }
    }

    private func computeGravity() {
        let n = Double(gravSamples.count)
        gravity = Vec3(
            x: gravSamples.reduce(0) { $0 + $1.x } / n,
            y: gravSamples.reduce(0) { $0 + $1.y } / n,
            z: gravSamples.reduce(0) { $0 + $1.z } / n
        )
    }

    private func computeAlignment(sample: GPSSample) {
        let hdgRad = sample.headingDeg * .pi / 180.0
        let cosH = cos(hdgRad), sinH = sin(hdgRad)
        rotationMatrix = [
            [cosH, sinH, 0],
            [-sinH, cosH, 0],
            [0, 0, 1]
        ]
    }

    private func applyRotation(_ v: Vec3) -> Vec3 {
        let r = rotationMatrix
        return Vec3(
            x: r[0][0] * v.x + r[0][1] * v.y + r[0][2] * v.z,
            y: r[1][0] * v.x + r[1][1] * v.y + r[1][2] * v.z,
            z: r[2][0] * v.x + r[2][1] * v.y + r[2][2] * v.z
        )
    }
}
