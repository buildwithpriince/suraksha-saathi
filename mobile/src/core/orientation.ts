/**
 * Camera direction from the device rotation quaternion (3DoF anchoring, D-027).
 *
 * The quaternion (w, x, y, z) rotates device coordinates into world East-North-Up coordinates
 * (Android rotation vector). Device axes: x to the right of the screen, y to its top, z out of the
 * screen towards the user, so the back camera looks along device -z. Heading and elevation are
 * robust with the phone held upright, where Euler yaw/pitch/roll hit gimbal lock.
 *
 * Functions are plain arithmetic so they also run inside Reanimated worklets ('worklet' directive).
 */

export interface Quaternion {
  qw: number;
  qx: number;
  qy: number;
  qz: number;
}

export interface Direction {
  /** Degrees clockwise from north (or from the sensor's reference), in [0, 360). */
  headingDeg: number;
  /** Degrees above the horizon, in [-90, 90]. */
  elevationDeg: number;
}

const DEG = 180 / Math.PI;

/**
 * Reanimated's `SensorType.ROTATION` reports Android's rotation-vector quaternion remapped to
 * iOS axes: qx = x, qy = z, qz = −y (ReanimatedSensorListener.kt). Undo that to get the
 * device → East-North-Up rotation this module expects.
 */
export function fromReanimatedRotation(v: Quaternion): Quaternion {
  'worklet';
  return { qw: v.qw, qx: v.qx, qy: -v.qz, qz: v.qy };
}

export function cameraDirection(q: Quaternion): Direction {
  'worklet';
  const { qw: w, qx: x, qy: y, qz: z } = q;
  // Forward = R(q) · (0, 0, -1) = -(third column of the rotation matrix)
  const fx = -2 * (x * z + w * y);
  const fy = -2 * (y * z - w * x);
  const fz = -(1 - 2 * (x * x + y * y));
  const horizontal = Math.sqrt(fx * fx + fy * fy);
  const elevationDeg = Math.atan2(fz, horizontal) * DEG;
  let headingDeg = Math.atan2(fx, fy) * DEG;
  if (headingDeg < 0) headingDeg += 360;
  return { headingDeg, elevationDeg };
}

/** Signed smallest difference a − b in degrees, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  'worklet';
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Screen offset (px from the screen centre) of a direction anchored in the world, given where
 * the camera points now. `pxPerDeg` comes from the preview's field of view.
 */
export function screenOffset(anchor: Direction, camera: Direction, pxPerDeg: number): { dx: number; dy: number } {
  'worklet';
  return {
    dx: angleDiff(anchor.headingDeg, camera.headingDeg) * pxPerDeg,
    dy: -(anchor.elevationDeg - camera.elevationDeg) * pxPerDeg,
  };
}

/** docs/02 `exitBehind`: the exit lies more than `minAngleDeg` away from where the camera faces. */
export function isBehind(exitHeadingDeg: number, cameraHeadingDeg: number, minAngleDeg: number): boolean {
  return Math.abs(angleDiff(exitHeadingDeg, cameraHeadingDeg)) > minAngleDeg;
}
