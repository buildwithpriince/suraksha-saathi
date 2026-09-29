import { describe, expect, test } from 'vitest';

import {
  CONVENTION_SWITCH_FRAMES,
  angleBetween,
  angleDiff,
  bestConvention,
  conventionStep,
  gravityMismatchDeg,
  quatConjugate,
  rotateInverse,
  toDeviceToWorld,
  type ConventionState,
  cameraDirection,
  directionToVector,
  fromReanimatedRotation,
  isBehind,
  project,
  quatFromRotationVector,
  rotationVectorOf,
  screenOffset,
  unproject,
  vectorToDirection,
  type Quaternion,
} from './orientation';

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

describe('pinhole projection (D-036)', () => {
  const F = 600;
  const at = (headingDeg: number, elevationDeg: number) => directionToVector({ headingDeg, elevationDeg });

  test('direction <-> vector round trip, across north', () => {
    for (const d of [
      { headingDeg: 0, elevationDeg: 0 },
      { headingDeg: 359, elevationDeg: -30 },
      { headingDeg: 123.4, elevationDeg: 45 },
    ]) {
      const back = vectorToDirection(directionToVector(d));
      expect(back.headingDeg).toBeCloseTo(d.headingDeg);
      expect(back.elevationDeg).toBeCloseTo(d.elevationDeg);
    }
  });

  test('where the camera points projects to the centre', () => {
    const p = project(at(0, 0), UPRIGHT, F);
    expect(p.inFront).toBe(true);
    expect(p.dx).toBeCloseTo(0);
    expect(p.dy).toBeCloseTo(0);
  });

  test('10 degrees right and 10 degrees up land at f·tan(10°), not a linear pxPerDeg', () => {
    const right = project(at(10, 0), UPRIGHT, F);
    expect(right.dx).toBeCloseTo(F * Math.tan((10 * Math.PI) / 180));
    expect(right.dy).toBeCloseTo(0);
    const up = project(at(0, 10), UPRIGHT, F);
    expect(up.dx).toBeCloseTo(0);
    expect(up.dy).toBeCloseTo(-F * Math.tan((10 * Math.PI) / 180)); // screen y grows downwards
  });

  test('a turn moves the overlay the opposite way by the same angle', () => {
    const turned = compose(rotation([0, 0, 1], -20), UPRIGHT); // turned 20° right
    const p = project(at(0, 0), turned, F);
    expect(p.dx).toBeCloseTo(-F * Math.tan((20 * Math.PI) / 180));
  });

  test('unproject inverts project, also with the phone tilted and rolled', () => {
    const q = compose(rotation([0, 1, 0], 25), compose(rotation([0, 0, 1], -70), rotation([1, 0, 0], 70)));
    for (const [dx, dy] of [
      [0, 0],
      [120, -80],
      [-170, 300],
    ] as const) {
      const p = project(unproject(dx, dy, q, F), q, F);
      expect(p.dx).toBeCloseTo(dx, 6);
      expect(p.dy).toBeCloseTo(dy, 6);
    }
  });

  test('rolling the phone rolls the scene: a point to the right drops as the phone rolls left', () => {
    // Roll the phone 30° counter-clockwise (seen from the user): about device +z
    const rolled = compose(UPRIGHT, rotation([0, 0, 1], 30));
    const p = project(at(10, 0), rolled, F);
    expect(p.dx).toBeGreaterThan(0);
    expect(p.dy).toBeGreaterThan(0);
  });

  test('a direction behind the camera is not in front and lands far off screen on its side', () => {
    const p = project(at(150, 0), UPRIGHT, F);
    expect(p.inFront).toBe(false);
    expect(p.dx).toBeGreaterThan(10_000);
  });

  test('rotation vector round trip', () => {
    const r = { x: 0.3, y: -0.2, z: 1.1 };
    const back = rotationVectorOf(quatFromRotationVector(r));
    expect(back.x).toBeCloseTo(r.x);
    expect(back.y).toBeCloseTo(r.y);
    expect(back.z).toBeCloseTo(r.z);
  });
});

describe('reading the platform rotation quaternion, checked against gravity (D-039)', () => {
  // Poses a phone is held in during a drill: upright facing various ways, tipped down, rolled
  const poses: [string, Quaternion][] = [
    ['upright facing north', UPRIGHT],
    ['upright facing east', compose(rotation([0, 0, 1], -90), UPRIGHT)],
    ['looking down at the floor, facing 200°', compose(rotation([0, 0, 1], -200), rotation([1, 0, 0], 50))],
    ['upright, rolled 20°', compose(compose(rotation([0, 0, 1], -35), UPRIGHT), rotation([0, 0, 1], 20))],
  ];
  const down = (q: Quaternion) => {
    const d = rotateInverse(q, { x: 0, y: 0, z: -1 });
    return { x: d.x * 9.81, y: d.y * 9.81, z: d.z * 9.81 }; // Reanimated reports m/s²
  };
  const androidReport = (q: Quaternion): Quaternion => ({ qw: q.qw, qx: q.qx, qy: q.qz, qz: -q.qy });

  test.each(poses)('%s: whichever way the platform reports it, the chosen reading is the true orientation', (_name, truth) => {
    // (In some poses two readings give the same orientation, e.g. facing exactly north the Android
    // remap changes nothing; then either is right, so the orientation is checked, not the label.)
    for (const reported of [androidReport(truth), truth, quatConjugate(truth)]) {
      const best = bestConvention(reported, down(truth));
      expect(best.mismatchDeg).toBeLessThan(1e-3);
      expect(angleBetween(toDeviceToWorld(reported, best.convention), truth)).toBeLessThan(1e-3);
    }
  });

  test.each(poses)('%s: a wrong reading disagrees with gravity by far more than the switch threshold', (_name, truth) => {
    expect(gravityMismatchDeg(toDeviceToWorld(quatConjugate(truth), 'android'), down(truth))).toBeGreaterThan(25);
  });

  test('a wrong first guess is corrected after about half a second, not on one frame', () => {
    const truth = compose(rotation([0, 0, 1], -60), UPRIGHT);
    const reported = quatConjugate(truth); // say iOS reports world -> device
    let s: ConventionState = { convention: 'device-to-world', votes: 0, mismatchDeg: 0 };
    let switchedAt = -1;
    for (let i = 0; i < 60 && switchedAt < 0; i++) {
      const next = conventionStep(s, reported, down(truth));
      if (next.switched) switchedAt = i;
      s = next;
    }
    expect(switchedAt).toBe(CONVENTION_SWITCH_FRAMES - 1);
    expect(s.convention).toBe('world-to-device');
    expect(s.mismatchDeg).toBeLessThan(1e-3);
  });

  test('flat on a table the readings can agree: no switching back and forth', () => {
    const flatYawed = rotation([0, 0, 1], 40); // screen up, turned: conjugate has the same "down"
    let s: ConventionState = { convention: 'device-to-world', votes: 0, mismatchDeg: 0 };
    for (let i = 0; i < 100; i++) s = conventionStep(s, flatYawed, down(flatYawed));
    expect(s.convention).toBe('device-to-world');
  });
});
