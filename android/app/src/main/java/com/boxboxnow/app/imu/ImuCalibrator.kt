package com.boxboxnow.app.imu

import com.boxboxnow.app.models.GPSSample
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.sqrt

/**
 * IMU calibration matching iOS ImuCalibrator / web calibration.ts.
 *
 * Phase 1 (sampling) — kart stationary: capture 100 gravity samples to remove bias.
 * Phase 2 (ready)    — kart moving >15 km/h: correlate heading+accel to align axes.
 */
class ImuCalibrator {
    enum class Phase { IDLE, SAMPLING, READY, ALIGNED }

    private data class Vec3(var x: Double, var y: Double, var z: Double) {
        companion object {
            val ZERO get() = Vec3(0.0, 0.0, 0.0)
        }
    }

    private val _phase = MutableStateFlow(Phase.IDLE)
    val phase = _phase.asStateFlow()

    private val _progress = MutableStateFlow(0.0)
    val progress = _progress.asStateFlow()

    private val gravSamples = mutableListOf<Vec3>()
    private val headingSamples = mutableListOf<Pair<Double, Double>>()
    private var gravity = Vec3.ZERO
    private var rotationMatrix: DoubleArray? = null

    private val staticSampleCount = 100
    private val alignSpeedKmh = 15.0
    private val alignSampleCount = 10
    private val minAccelMagnitude = 0.05

    fun startCalibration() {
        gravSamples.clear()
        headingSamples.clear()
        gravity = Vec3.ZERO
        rotationMatrix = null
        _progress.value = 0.0
        _phase.value = Phase.SAMPLING
    }

    fun skipAlignment() {
        if (_phase.value != Phase.READY) return
        rotationMatrix = doubleArrayOf(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
        _phase.value = Phase.ALIGNED
    }

    fun reset() {
        _phase.value = Phase.IDLE
        _progress.value = 0.0
        gravSamples.clear()
        headingSamples.clear()
        gravity = Vec3.ZERO
        rotationMatrix = null
    }

    /** Processes a sample and returns it with gravity removed + axes rotated. */
    fun calibrate(sample: GPSSample): GPSSample {
        when (_phase.value) {
            Phase.IDLE -> return sample

            Phase.SAMPLING -> {
                gravSamples.add(Vec3(sample.gForceX, sample.gForceY, sample.gForceZ))
                _progress.value = gravSamples.size.toDouble() / staticSampleCount
                if (gravSamples.size >= staticSampleCount) {
                    computeGravity()
                    _progress.value = 1.0
                    _phase.value = Phase.READY
                }
                return sample
            }

            Phase.READY -> {
                val s = sample.copy(
                    gForceX = sample.gForceX - gravity.x,
                    gForceY = sample.gForceY - gravity.y,
                    gForceZ = sample.gForceZ - gravity.z,
                )
                if (s.speedKmh > alignSpeedKmh) {
                    val mag = sqrt(s.gForceX * s.gForceX + s.gForceY * s.gForceY)
                    if (mag >= minAccelMagnitude) {
                        headingSamples.add(s.gForceX to s.gForceY)
                        if (headingSamples.size >= alignSampleCount) {
                            buildRotationMatrix()
                            _phase.value = Phase.ALIGNED
                        }
                    }
                }
                return s
            }

            Phase.ALIGNED -> {
                val noGrav = Vec3(
                    sample.gForceX - gravity.x,
                    sample.gForceY - gravity.y,
                    sample.gForceZ - gravity.z,
                )
                val r = applyRotation(noGrav)
                return sample.copy(gForceX = r.x, gForceY = r.y, gForceZ = r.z)
            }
        }
    }

    private fun computeGravity() {
        val n = gravSamples.size.toDouble()
        gravity = Vec3(
            gravSamples.sumOf { it.x } / n,
            gravSamples.sumOf { it.y } / n,
            gravSamples.sumOf { it.z } / n,
        )
    }

    private fun buildRotationMatrix() {
        val gLen = sqrt(gravity.x * gravity.x + gravity.y * gravity.y + gravity.z * gravity.z)
        if (gLen < 0.001) {
            rotationMatrix = doubleArrayOf(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
            return
        }
        val up = Vec3(-gravity.x / gLen, -gravity.y / gLen, -gravity.z / gLen)

        var fx = 0.0
        var fy = 0.0
        for ((gx, gy) in headingSamples) { fx += gx; fy += gy }
        val fLen2d = sqrt(fx * fx + fy * fy)
        if (fLen2d < 0.001) {
            rotationMatrix = doubleArrayOf(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
            return
        }

        var fwd = Vec3(fx / fLen2d, fy / fLen2d, 0.0)
        val dot = fwd.x * up.x + fwd.y * up.y + fwd.z * up.z
        fwd = Vec3(fwd.x - dot * up.x, fwd.y - dot * up.y, fwd.z - dot * up.z)
        val fwdLen = sqrt(fwd.x * fwd.x + fwd.y * fwd.y + fwd.z * fwd.z)
        if (fwdLen < 0.001) {
            rotationMatrix = doubleArrayOf(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
            return
        }
        fwd = Vec3(fwd.x / fwdLen, fwd.y / fwdLen, fwd.z / fwdLen)

        val right = Vec3(
            fwd.y * up.z - fwd.z * up.y,
            fwd.z * up.x - fwd.x * up.z,
            fwd.x * up.y - fwd.y * up.x,
        )

        // Column-major
        rotationMatrix = doubleArrayOf(
            right.x, fwd.x, up.x,
            right.y, fwd.y, up.y,
            right.z, fwd.z, up.z,
        )
    }

    private fun applyRotation(v: Vec3): Vec3 {
        val r = rotationMatrix ?: return v
        return Vec3(
            r[0] * v.x + r[3] * v.y + r[6] * v.z,
            r[1] * v.x + r[4] * v.y + r[7] * v.z,
            r[2] * v.x + r[5] * v.y + r[8] * v.z,
        )
    }
}
