import { describe, expect, test } from 'vitest';

import { angleDiff, cameraDirection, fromReanimatedRotation, isBehind, screenOffset, type Quaternion } from './orientation';

/** Rotation of `deg` degrees about a unit axis. */
function rotation(axis: [number, number, number], deg: number): Quaternion {
  const h = (deg * Math.PI) / 360;
  const s = Math.sin(h);
  return { qw: Math.cos(h), qx: axis[0] * s, qy: axis[1] * s, qz: axis[2] * s };
}

/** a · b (apply b first, then a). */
function compose(a: Quaternion, b: Quaternion): Quaternion {
  return {
    qw: a.qw * b.qw - a.qx * b.qx - a.qy * b.qy - a.qz * b.qz,
    qx: a.qw * b.qx + a.qx * b.qw + a.qy * b.qz - a.qz * b.qy,
    qy: a.qw * b.qy - a.qx * b.qz + a.qy * b.qw + a.qz * b.qx,
    qz: a.qw * b.qz + a.qx * b.qy - a.qy * b.qx + a.qz * b.qw,
  };
}

const UPRIGHT = rotation([1, 0, 0], 90); // phone held upright in portrait, back camera facing north

describe('cameraDirection', () => {
  test('flat, screen up: the back camera looks at the floor', () => {
    expect(cameraDirection({ qw: 1, qx: 0, qy: 0, qz: 0 }).elevationDeg).toBeCloseTo(-90);
  });

  test('upright facing north', () => {
    const d = cameraDirection(UPRIGHT);
    expect(d.headingDeg).toBeCloseTo(0);
    expect(d.elevationDeg).toBeCloseTo(0);
  });

  test('turning right (clockwise seen from above) increases the heading', () => {
    // A right turn is a rotation about world up (z) by -90 degrees
    const d = cameraDirection(compose(rotation([0, 0, 1], -90), UPRIGHT));
    expect(d.headingDeg).toBeCloseTo(90);
    expect(d.elevationDeg).toBeCloseTo(0);
  });

  test('tilting the top of the phone back raises the elevation', () => {
    const d = cameraDirection(rotation([1, 0, 0], 120));
    expect(d.elevationDeg).toBeCloseTo(30);
    expect(d.headingDeg).toBeCloseTo(0);
  });
});

test('fromReanimatedRotation undoes the Android -> iOS axis remap', () => {
  const android = compose(rotation([0, 0, 1], -90), UPRIGHT);
  const reported = { qw: android.qw, qx: android.qx, qy: android.qz, qz: -android.qy };
  const d = cameraDirection(fromReanimatedRotation(reported));
  expect(d.headingDeg).toBeCloseTo(90);
  expect(d.elevationDeg).toBeCloseTo(0);
});

describe('angles', () => {
  test('angleDiff wraps to (-180, 180]', () => {
    expect(angleDiff(10, 350)).toBeCloseTo(20);
    expect(angleDiff(350, 10)).toBeCloseTo(-20);
    expect(angleDiff(180, 0)).toBeCloseTo(180);
    expect(angleDiff(0, 180)).toBeCloseTo(180);
  });

  test('an anchor to the right and above appears right of and above the centre', () => {
    const o = screenOffset({ headingDeg: 20, elevationDeg: 5 }, { headingDeg: 10, elevationDeg: 0 }, 10);
    expect(o.dx).toBeCloseTo(100);
    expect(o.dy).toBeCloseTo(-50);
  });

  test('isBehind uses the smallest angle', () => {
    expect(isBehind(0, 170, 120)).toBe(true);
    expect(isBehind(0, 200, 120)).toBe(true);
    expect(isBehind(0, 90, 120)).toBe(false);
    expect(isBehind(350, 10, 120)).toBe(false);
  });
});
