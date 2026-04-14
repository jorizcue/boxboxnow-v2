import Foundation
import Combine

/// IMU calibration matching the web's calibration.ts logic.
///
/// Phase 1 — Static (kart stationary): captures 100 gravity samples to remove bias.
/// Phase 2 — Dynamic (kart moving >15 km/h): uses GPS heading + acceleration
///           correlation to align device axes to vehicle axes (lateral/longitudinal/vertical).
final class ImuCalibrator: ObservableObject {
    enum Phase: String, Equatable {
        case idle, sampling, ready, aligned
    }

    struct Vec3 {
        var x, y, z: Double
        static let zero = Vec3(x: 0, y: 0, z: 0)
    }

    @Published var phase: Phase = .idle
    @Published var progress: Double = 0  // 0-1 during sampling

    private var gravSamples: [Vec3] = []
    private var headingSamples: [(gx: Double, gy: Double)] = []
    private var gravity: Vec3 = .zero
    private var rotationMatrix: [Double]? = nil  // 3x3 column-major

    private let staticSampleCount = 100
    private let alignSpeedKmh = 15.0
    private let alignSampleCount = 10
    private let minAccelMagnitude = 0.05  // G — minimum to detect braking/accel

    // MARK: - Public API

    func startCalibration() {
        gravSamples.removeAll()
        headingSamples.removeAll()
        gravity = .zero
        rotationMatrix = nil
        progress = 0
        phase = .sampling
    }

    func skipAlignment() {
        guard phase == .ready else { return }
        rotationMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1]  // identity
        phase = .aligned
    }

    func reset() {
        phase = .idle
        progress = 0
        gravSamples.removeAll()
        headingSamples.removeAll()
        gravity = .zero
        rotationMatrix = nil
    }

    /// Process a sample through the calibration pipeline.
    /// Returns the sample with calibrated g-force values.
    func calibrate(sample: GPSSample) -> GPSSample {
        var s = sample

        switch phase {
        case .idle:
            return s

        case .sampling:
            // Collect static gravity samples
            gravSamples.append(Vec3(x: s.gForceX, y: s.gForceY, z: s.gForceZ))
            progress = Double(gravSamples.count) / Double(staticSampleCount)

            if gravSamples.count >= staticSampleCount {
                computeGravity()
                progress = 1.0
                phase = .ready
            }
            return s

        case .ready:
            // Remove gravity
            s.gForceX -= gravity.x
            s.gForceY -= gravity.y
            s.gForceZ -= gravity.z

            // Collect heading samples when moving fast enough
            if s.speedKmh > alignSpeedKmh {
                let mag = sqrt(s.gForceX * s.gForceX + s.gForceY * s.gForceY)
                if mag >= minAccelMagnitude {
                    headingSamples.append((gx: s.gForceX, gy: s.gForceY))

                    if headingSamples.count >= alignSampleCount {
                        buildRotationMatrix()
                        phase = .aligned
                    }
                }
            }
            return s

        case .aligned:
            // Full transform: remove gravity + rotate to vehicle axes
            let noGrav = Vec3(
                x: s.gForceX - gravity.x,
                y: s.gForceY - gravity.y,
                z: s.gForceZ - gravity.z
            )
            let rotated = applyRotation(noGrav)
            s.gForceX = rotated.x
            s.gForceY = rotated.y
            s.gForceZ = rotated.z
            return s
        }
    }

    // MARK: - Private

    private func computeGravity() {
        let n = Double(gravSamples.count)
        gravity = Vec3(
            x: gravSamples.reduce(0) { $0 + $1.x } / n,
            y: gravSamples.reduce(0) { $0 + $1.y } / n,
            z: gravSamples.reduce(0) { $0 + $1.z } / n
        )
    }

    private func buildRotationMatrix() {
        let gLen = sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z)
        guard gLen > 0.001 else {
            rotationMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1]
            return
        }

        // "Up" axis = normalize(-gravity)
        let up = Vec3(x: -gravity.x / gLen, y: -gravity.y / gLen, z: -gravity.z / gLen)

        // "Forward" axis: average acceleration direction during braking/accel
        var fx = 0.0, fy = 0.0
        for s in headingSamples {
            fx += s.gx
            fy += s.gy
        }
        let fLen2d = sqrt(fx * fx + fy * fy)
        guard fLen2d > 0.001 else {
            rotationMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1]
            return
        }

        // Forward in device coords (projected)
        var fwd = Vec3(x: fx / fLen2d, y: fy / fLen2d, z: 0)

        // Orthogonalize forward w.r.t. up: fwd = fwd - (fwd·up)*up
        let dot = fwd.x * up.x + fwd.y * up.y + fwd.z * up.z
        fwd = Vec3(x: fwd.x - dot * up.x, y: fwd.y - dot * up.y, z: fwd.z - dot * up.z)
        let fwdLen = sqrt(fwd.x * fwd.x + fwd.y * fwd.y + fwd.z * fwd.z)
        guard fwdLen > 0.001 else {
            rotationMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1]
            return
        }
        fwd = Vec3(x: fwd.x / fwdLen, y: fwd.y / fwdLen, z: fwd.z / fwdLen)

        // "Right" (lateral) = forward × up
        let right = Vec3(
            x: fwd.y * up.z - fwd.z * up.y,
            y: fwd.z * up.x - fwd.x * up.z,
            z: fwd.x * up.y - fwd.y * up.x
        )

        // Column-major: maps device coords → vehicle coords
        // x = lateral (right+), y = longitudinal (forward+), z = vertical (up+)
        rotationMatrix = [
            right.x, fwd.x, up.x,
            right.y, fwd.y, up.y,
            right.z, fwd.z, up.z,
        ]
    }

    private func applyRotation(_ v: Vec3) -> Vec3 {
        guard let R = rotationMatrix else { return v }
        // Column-major: R[col*3+row]
        return Vec3(
            x: R[0] * v.x + R[3] * v.y + R[6] * v.z,
            y: R[1] * v.x + R[4] * v.y + R[7] * v.z,
            z: R[2] * v.x + R[5] * v.y + R[8] * v.z
        )
    }
}
