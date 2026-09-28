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

// --- Full-quaternion projection (D-036) ---------------------------------------------------------
// World vectors are East-North-Up; device vectors use the device axes described at the top.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const IDENTITY: Quaternion = { qw: 1, qx: 0, qy: 0, qz: 0 };

/** a · b: apply b first, then a. */
export function quatMultiply(a: Quaternion, b: Quaternion): Quaternion {
  'worklet';
  return {
    qw: a.qw * b.qw - a.qx * b.qx - a.qy * b.qy - a.qz * b.qz,
    qx: a.qw * b.qx + a.qx * b.qw + a.qy * b.qz - a.qz * b.qy,
    qy: a.qw * b.qy - a.qx * b.qz + a.qy * b.qw + a.qz * b.qx,
    qz: a.qw * b.qz + a.qx * b.qy - a.qy * b.qx + a.qz * b.qw,
  };
}

export function quatConjugate(q: Quaternion): Quaternion {
  'worklet';
  return { qw: q.qw, qx: -q.qx, qy: -q.qy, qz: -q.qz };
}

/** Unit length; a zero quaternion (a sensor that has not reported yet) becomes the identity. */
export function quatNormalize(q: Quaternion): Quaternion {
  'worklet';
  const n = Math.sqrt(q.qw * q.qw + q.qx * q.qx + q.qy * q.qy + q.qz * q.qz);
  if (n < 1e-9) return IDENTITY;
  return { qw: q.qw / n, qx: q.qx / n, qy: q.qy / n, qz: q.qz / n };
}

/** The rotation by the rotation vector `r` (axis × angle, radians). */
export function quatFromRotationVector(r: Vec3): Quaternion {
  'worklet';
  const angle = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
  if (angle < 1e-12) return { qw: 1, qx: r.x / 2, qy: r.y / 2, qz: r.z / 2 };
  const s = Math.sin(angle / 2) / angle;
  return { qw: Math.cos(angle / 2), qx: r.x * s, qy: r.y * s, qz: r.z * s };
}

/** The rotation vector (axis × angle, radians, angle ≤ π) of a unit quaternion. */
export function rotationVectorOf(q: Quaternion): Vec3 {
  'worklet';
  // Shortest way round: q and −q are the same rotation
  const sign = q.qw < 0 ? -1 : 1;
  const w = q.qw * sign;
  const x = q.qx * sign;
  const y = q.qy * sign;
  const z = q.qz * sign;
  const v = Math.sqrt(x * x + y * y + z * z);
  if (v < 1e-12) return { x: 2 * x, y: 2 * y, z: 2 * z };
  const angle = 2 * Math.atan2(v, w);
  return { x: (x / v) * angle, y: (y / v) * angle, z: (z / v) * angle };
}

/** R(q) · v: a device vector in world coordinates. */
export function rotate(q: Quaternion, v: Vec3): Vec3 {
  'worklet';
  const { qw: w, qx: x, qy: y, qz: z } = q;
  // t = 2 (q.xyz × v); v' = v + w t + q.xyz × t
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

/** R(q)ᵀ · v: a world vector in device coordinates. */
export function rotateInverse(q: Quaternion, v: Vec3): Vec3 {
  'worklet';
  return rotate(quatConjugate(q), v);
}

/** Unit world vector of a direction. */
export function directionToVector(d: Direction): Vec3 {
  'worklet';
  const h = d.headingDeg / DEG;
  const e = d.elevationDeg / DEG;
  return { x: Math.cos(e) * Math.sin(h), y: Math.cos(e) * Math.cos(h), z: Math.sin(e) };
}

export function vectorToDirection(v: Vec3): Direction {
  'worklet';
  const horizontal = Math.sqrt(v.x * v.x + v.y * v.y);
  let headingDeg = Math.atan2(v.x, v.y) * DEG;
  if (headingDeg < 0) headingDeg += 360;
  return { headingDeg, elevationDeg: Math.atan2(v.z, horizontal) * DEG };
}

/**
 * Pinhole projection of a world direction into the portrait camera preview: px from the screen
 * centre (x right, y down), with `focalPx` from the preview's field of view (layout.ts). The back
 * camera looks along device −z. A direction behind the camera gets `inFront: false` and a far
 * off-screen point on its side, so a pinned overlay still goes to the nearest edge.
 */
export function project(world: Vec3, q: Quaternion, focalPx: number): { dx: number; dy: number; inFront: boolean } {
  'worklet';
  const d = rotateInverse(q, world);
  const depth = -d.z;
  if (depth > 1e-3) return { dx: (focalPx * d.x) / depth, dy: (-focalPx * d.y) / depth, inFront: true };
  const side = Math.sqrt(d.x * d.x + d.y * d.y);
  if (side < 1e-6) return { dx: 1e5, dy: 0, inFront: false };
  return { dx: (1e5 * d.x) / side, dy: (-1e5 * d.y) / side, inFront: false };
}

/** The world direction seen at (dx, dy) px from the preview centre: the inverse of `project`. */
export function unproject(dx: number, dy: number, q: Quaternion, focalPx: number): Vec3 {
  'worklet';
  const x = dx / focalPx;
  const y = -dy / focalPx;
  const n = Math.sqrt(x * x + y * y + 1);
  return rotate(q, { x: x / n, y: y / n, z: -1 / n });
}

/** Angle between two unit quaternions' rotations, degrees. */
export function angleBetween(a: Quaternion, b: Quaternion): number {
  'worklet';
  const dot = Math.abs(a.qw * b.qw + a.qx * b.qx + a.qy * b.qy + a.qz * b.qz);
  return 2 * Math.acos(Math.min(1, dot)) * DEG;
}
