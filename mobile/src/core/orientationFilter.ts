/**
 * Stabilised device orientation for overlay anchoring (D-036).
 *
 * Android's rotation vector (the reference) fuses the compass, so near steel its heading jumps by
 * tens of degrees as the worker moves, and overlays slide with it. This complementary filter
 * propagates the orientation with the gyroscope (smooth, no lag) and pulls it towards the
 * reference slowly: tilt within about a second, heading over several seconds, so a compass jump
 * is mostly rejected while gyro drift stays bounded. Without a gyroscope it falls back to an
 * adaptive low-pass on the reference: heavy when the phone is still, none when it turns.
 *
 * Plain arithmetic with 'worklet' directives: it runs per frame on the UI thread.
 */
import {
  angleBetween,
  quatFromRotationVector,
  quatConjugate,
  quatMultiply,
  quatNormalize,
  rotationVectorOf,
  type Quaternion,
  type Vec3,
} from './orientation';

/** Time constant pulling the filtered tilt (pitch, roll) towards the reference, seconds. */
export const TILT_TAU_SEC = 1;
/** Time constant pulling the filtered heading towards the reference, seconds. */
export const HEADING_TAU_SEC = 8;
/**
 * The heading is corrected towards the compass only while the phone turns slower than this. While
 * turning, the gyroscope is exact over seconds and the compass is at its least reliable (it lags,
 * and near steel its error changes with direction), so a compass error met mid-turn is not pulled
 * in (D-039).
 */
export const HEADING_GATE_DEG_PER_SEC = 20;
/** Larger disagreements (startup, a gyro glitch) snap to the reference. */
export const SNAP_DEG = 60;
/** Without a gyroscope: differences below this are treated as jitter and smoothed hard. */
export const JITTER_DEG = 1.5;

export interface FilterState {
  q: Quaternion;
  initialised: boolean;
  /** Angular speed of the filtered orientation, degrees per second (gates marker corrections). */
  speedDegPerSec: number;
  /**
   * Angle between the filtered orientation and the raw rotation vector, degrees (debug overlay,
   * D-039). Small during turns when the gyroscope is read correctly; a gyro axis or sign error
   * would show here as a large value every time the phone turns.
   */
  refDisagreeDeg: number;
}

export const INITIAL_FILTER_STATE: FilterState = { q: { qw: 1, qx: 0, qy: 0, qz: 0 }, initialised: false, speedDegPerSec: 0, refDisagreeDeg: 0 };

function isValid(q: Quaternion): boolean {
  'worklet';
  const n = q.qw * q.qw + q.qx * q.qx + q.qy * q.qy + q.qz * q.qz;
  return Number.isFinite(n) && n > 0.25;
}

function gain(dt: number, tau: number): number {
  'worklet';
  return 1 - Math.exp(-dt / tau);
}

/**
 * One filter step. `reference`: the rotation-vector orientation (device → world, as in
 * orientation.ts). `gyro`: angular rate about the device axes in rad/s, or null if the phone has
 * no gyroscope. `dt`: seconds since the last step.
 */
export function filterStep(state: FilterState, reference: Quaternion, gyro: Vec3 | null, dt: number): FilterState {
  'worklet';
  if (!isValid(reference)) return state; // the sensor has not reported yet
  const ref = quatNormalize(reference);
  if (!state.initialised || !(dt > 0) || dt > 0.5) return { q: ref, initialised: true, speedDegPerSec: 0, refDisagreeDeg: 0 };

  if (gyro === null) {
    // Adaptive low-pass: follow large motions at once, smooth sub-degree jitter
    const apart = angleBetween(state.q, ref);
    const alpha = Math.min(1, Math.max(0.15, apart / (4 * JITTER_DEG)));
    const error = rotationVectorOf(quatMultiply(ref, quatConjugate(state.q)));
    const q = quatNormalize(quatMultiply(quatFromRotationVector({ x: error.x * alpha, y: error.y * alpha, z: error.z * alpha }), state.q));
    return { q, initialised: true, speedDegPerSec: angleBetween(q, state.q) / dt, refDisagreeDeg: angleBetween(q, ref) };
  }

  // Predict: q ← q · exp(ω dt), ω in device coordinates
  const predicted = quatNormalize(quatMultiply(state.q, quatFromRotationVector({ x: gyro.x * dt, y: gyro.y * dt, z: gyro.z * dt })));
  // Correct: the world-frame rotation taking the prediction to the reference, split into tilt
  // (about world x, y) and heading (about world z, up), each pulled in with its own time constant
  const error = rotationVectorOf(quatMultiply(ref, quatConjugate(predicted)));
  const errorDeg = (Math.sqrt(error.x * error.x + error.y * error.y + error.z * error.z) * 180) / Math.PI;
  if (errorDeg > SNAP_DEG) return { q: ref, initialised: true, speedDegPerSec: 0, refDisagreeDeg: 0 };
  const speedDegPerSec = (Math.sqrt(gyro.x * gyro.x + gyro.y * gyro.y + gyro.z * gyro.z) * 180) / Math.PI;
  const kTilt = gain(dt, TILT_TAU_SEC);
  const kHeading = speedDegPerSec < HEADING_GATE_DEG_PER_SEC ? gain(dt, HEADING_TAU_SEC) : 0;
  const correction = quatFromRotationVector({ x: error.x * kTilt, y: error.y * kTilt, z: error.z * kHeading });
  const q = quatNormalize(quatMultiply(correction, predicted));
  return { q, initialised: true, speedDegPerSec, refDisagreeDeg: angleBetween(q, ref) };
}
