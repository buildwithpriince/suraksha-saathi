/**
 * Measuring the camera preview's field of view on the phone itself (D-039). expo-camera exposes
 * no focal length, FOV or sensor size, so the assumed lens FOV is only an estimate, and a wrong
 * FOV makes overlays move at the wrong rate when the phone turns. The calibration screen measures
 * it instead: the worker aims the centre of the screen at a real object, turns until the same
 * object sits on a guide line, and the gyroscope says how far the phone turned. The pinhole
 * projection then fixes the focal length exactly.
 */
import { project, quatFromRotationVector, quatMultiply, quatNormalize, rotateInverse, type Direction, type Quaternion, type Vec3 } from './orientation';

/** Plausible long-side FOVs for a phone's main camera; anything outside is a failed measurement. */
export const PLAUSIBLE_LONG_SIDE_FOV_DEG = [40, 100] as const;
/** A turn this small gives too few pixels for a reliable measurement. */
export const MIN_CALIBRATION_TURN_DEG = 8;

/** One gyroscope step: the device rotated by ω (rad/s, device axes) for dt seconds. */
export function integrateGyro(q: Quaternion, gyro: Vec3, dt: number): Quaternion {
  'worklet';
  return quatNormalize(quatMultiply(q, quatFromRotationVector({ x: gyro.x * dt, y: gyro.y * dt, z: gyro.z * dt })));
}

/**
 * Focal length (px) from one calibration turn. The object was at the screen centre; after the
 * device rotated by `turn` (device-frame rotation, as integrated from the gyroscope) it appears
 * `dxPx` from the centre horizontally. Pinhole: dx = f · x / −z for the object's direction in the
 * new device frame, so f = dx · −z / x. Uses only the horizontal position, so a guide line (any
 * height) is enough, and pitch or roll during the turn is accounted for exactly. Null when the
 * turn is too small or the geometry is degenerate.
 */
export function solveFocalFromTurn(turn: Quaternion, dxPx: number): number | null {
  const object = rotateInverse(turn, { x: 0, y: 0, z: -1 });
  const depth = -object.z;
  const turnedDeg = (Math.acos(Math.min(1, Math.max(-1, depth))) * 180) / Math.PI;
  if (depth <= 0.05 || Math.abs(object.x) < 1e-6 || turnedDeg < MIN_CALIBRATION_TURN_DEG) return null;
  const f = (dxPx * depth) / object.x;
  return f > 0 ? f : null;
}

/** Where the object would appear with a focal length `f`: how far off the current FOV puts an overlay. */
export function predictedDxPx(turn: Quaternion, focalPx: number): number {
  // The object's direction in the turned device frame, projected with the identity orientation
  return project(rotateInverse(turn, { x: 0, y: 0, z: -1 }), { qw: 1, qx: 0, qy: 0, qz: 0 }, focalPx).dx;
}

/** Angle between two directions, degrees: the rotate-away-and-return self-test error. */
export function directionErrorDeg(a: Direction, b: Direction): number {
  const va = dirVec(a);
  const vb = dirVec(b);
  const dot = va.x * vb.x + va.y * vb.y + va.z * vb.z;
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

function dirVec(d: Direction): Vec3 {
  const h = (d.headingDeg * Math.PI) / 180;
  const e = (d.elevationDeg * Math.PI) / 180;
  return { x: Math.cos(e) * Math.sin(h), y: Math.cos(e) * Math.cos(h), z: Math.sin(e) };
}

export function isPlausibleLongSideFov(deg: number): boolean {
  return deg >= PLAUSIBLE_LONG_SIDE_FOV_DEG[0] && deg <= PLAUSIBLE_LONG_SIDE_FOV_DEG[1];
}
