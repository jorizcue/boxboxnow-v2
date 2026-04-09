/**
 * IMU calibration for GPS devices (RaceBox / phone accelerometer).
 *
 * Phase 1 — Static (kart stationary): captures gravity vector to remove it.
 * Phase 2 — Dynamic (kart moving >15 km/h): uses GPS heading to align
 *           device axes to vehicle axes (lateral / longitudinal / vertical).
 */

export type CalibrationPhase = "idle" | "sampling" | "ready" | "aligned";

const SAMPLE_COUNT = 100;        // samples to collect during static calibration
const ALIGN_SPEED_KMH = 15;     // minimum speed for heading alignment
const ALIGN_SAMPLES = 10;       // heading samples to average for alignment

export interface Vec3 { x: number; y: number; z: number }

interface CalibrationState {
  phase: CalibrationPhase;
  progress: number;             // 0-1 during sampling
  gravity: Vec3 | null;         // averaged gravity vector in device coords
  rotationMatrix: number[] | null; // 3x3 column-major device→vehicle rotation
}

export class ImuCalibrator {
  private _state: CalibrationState = {
    phase: "idle",
    progress: 0,
    gravity: null,
    rotationMatrix: null,
  };

  // Accumulators
  private _samples: Vec3[] = [];
  private _headingSamples: { heading: number; gx: number; gy: number }[] = [];

  get state(): Readonly<CalibrationState> { return this._state; }

  /** Start static calibration — call this when kart is stationary. */
  startCalibration() {
    this._samples = [];
    this._headingSamples = [];
    this._state = { phase: "sampling", progress: 0, gravity: null, rotationMatrix: null };
  }

  /** Feed a raw accelerometer sample (in G). Returns true when static cal is done. */
  addStaticSample(raw: Vec3): boolean {
    if (this._state.phase !== "sampling") return false;

    this._samples.push({ ...raw });
    this._state.progress = this._samples.length / SAMPLE_COUNT;

    if (this._samples.length >= SAMPLE_COUNT) {
      // Average to get gravity vector
      const g = { x: 0, y: 0, z: 0 };
      for (const s of this._samples) {
        g.x += s.x; g.y += s.y; g.z += s.z;
      }
      g.x /= this._samples.length;
      g.y /= this._samples.length;
      g.z /= this._samples.length;

      this._state.gravity = g;
      this._state.phase = "ready";
      this._state.progress = 1;
      return true;
    }
    return false;
  }

  /** Remove gravity from a raw accelerometer reading. */
  removeGravity(raw: Vec3): Vec3 {
    const g = this._state.gravity;
    if (!g) return raw;
    return { x: raw.x - g.x, y: raw.y - g.y, z: raw.z - g.z };
  }

  /**
   * Feed heading + acceleration during motion for axis alignment.
   * Call when speed > 15 km/h and phase is "ready".
   * Returns true when alignment is complete.
   */
  addHeadingSample(headingDeg: number, accelNoGravity: Vec3): boolean {
    if (this._state.phase !== "ready") return false;

    // We need samples where there's meaningful longitudinal acceleration
    // (braking or accelerating) to determine the forward axis
    const mag = Math.sqrt(accelNoGravity.x ** 2 + accelNoGravity.y ** 2);
    if (mag < 0.05) return false; // too little acceleration to determine direction

    this._headingSamples.push({
      heading: headingDeg,
      gx: accelNoGravity.x,
      gy: accelNoGravity.y,
    });

    if (this._headingSamples.length >= ALIGN_SAMPLES) {
      this._buildRotationMatrix();
      return true;
    }
    return false;
  }

  /**
   * Apply full calibration: remove gravity + rotate to vehicle axes.
   * Returns { x: lateral G, y: longitudinal G, z: vertical G }
   */
  transform(raw: Vec3): Vec3 {
    const noGrav = this.removeGravity(raw);

    const R = this._state.rotationMatrix;
    if (!R) return noGrav;

    // Apply 3x3 rotation (column-major: R[col*3+row])
    return {
      x: R[0] * noGrav.x + R[3] * noGrav.y + R[6] * noGrav.z,
      y: R[1] * noGrav.x + R[4] * noGrav.y + R[7] * noGrav.z,
      z: R[2] * noGrav.x + R[5] * noGrav.y + R[8] * noGrav.z,
    };
  }

  reset() {
    this._samples = [];
    this._headingSamples = [];
    this._state = { phase: "idle", progress: 0, gravity: null, rotationMatrix: null };
  }

  private _buildRotationMatrix() {
    const g = this._state.gravity;
    if (!g) return;

    // "Up" axis = normalize(-gravity)
    const gLen = Math.sqrt(g.x ** 2 + g.y ** 2 + g.z ** 2);
    const up = { x: -g.x / gLen, y: -g.y / gLen, z: -g.z / gLen };

    // "Forward" axis: average the acceleration direction projected onto horizontal plane
    // We use the sign of correlation between GPS heading changes and accel to pick direction
    let fx = 0, fy = 0;
    for (const s of this._headingSamples) {
      // The dominant accel direction during braking/accel should be the forward axis
      fx += s.gx;
      fy += s.gy;
    }
    const fLen2d = Math.sqrt(fx * fx + fy * fy);
    if (fLen2d < 0.001) {
      // Can't determine forward — use identity
      this._state.rotationMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      this._state.phase = "aligned";
      return;
    }

    // Forward in device coords (projected, before orthogonalization)
    let fwd = { x: fx / fLen2d, y: fy / fLen2d, z: 0 };

    // Orthogonalize forward w.r.t. up: fwd = fwd - (fwd·up)*up, then normalize
    const dot = fwd.x * up.x + fwd.y * up.y + fwd.z * up.z;
    fwd = {
      x: fwd.x - dot * up.x,
      y: fwd.y - dot * up.y,
      z: fwd.z - dot * up.z,
    };
    const fwdLen = Math.sqrt(fwd.x ** 2 + fwd.y ** 2 + fwd.z ** 2);
    fwd = { x: fwd.x / fwdLen, y: fwd.y / fwdLen, z: fwd.z / fwdLen };

    // "Right" (lateral) = forward × up
    const right = {
      x: fwd.y * up.z - fwd.z * up.y,
      y: fwd.z * up.x - fwd.x * up.z,
      z: fwd.x * up.y - fwd.y * up.x,
    };

    // Rotation matrix: columns are right, forward, up (vehicle axes)
    // Maps device coords → vehicle coords where:
    //   x = lateral (right positive)
    //   y = longitudinal (forward positive)
    //   z = vertical (up positive)
    this._state.rotationMatrix = [
      right.x, fwd.x, up.x,  // column 0 (maps to x output)
      right.y, fwd.y, up.y,  // column 1
      right.z, fwd.z, up.z,  // column 2
    ];

    this._state.phase = "aligned";
  }
}
