import { describe, expect, test } from 'vitest';

import { angleDiff, cameraDirection, quatFromRotationVector, quatMultiply, type Quaternion } from './orientation';
import { INITIAL_FILTER_STATE, filterStep, type FilterState } from './orientationFilter';

const DEG = Math.PI / 180;
const DT = 1 / 60;

/** Phone upright, facing `headingDeg` (turning right = clockwise from above). */
function facing(headingDeg: number): Quaternion {
  const upright = quatFromRotationVector({ x: 90 * DEG, y: 0, z: 0 });
  return quatMultiply(quatFromRotationVector({ x: 0, y: 0, z: -headingDeg * DEG }), upright);
}

/** Deterministic pseudo-random noise in [-1, 1]. */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 2 - 1;
  };
}

function run(steps: number, reference: (i: number) => Quaternion, gyro: (i: number) => { x: number; y: number; z: number } | null, from: FilterState = INITIAL_FILTER_STATE) {
  let state = from;
  const headings: number[] = [];
  for (let i = 0; i < steps; i++) {
    state = filterStep(state, reference(i), gyro(i), DT);
    headings.push(cameraDirection(state.q).headingDeg);
  }
  return { state, headings };
}

describe('complementary filter (D-036)', () => {
  test('starts at the reference', () => {
    const { headings } = run(1, () => facing(40), () => ({ x: 0, y: 0, z: 0 }));
    expect(headings[0]).toBeCloseTo(40);
  });

  test('ignores a sensor that has not reported yet', () => {
    const state = filterStep(INITIAL_FILTER_STATE, { qw: 0, qx: 0, qy: 0, qz: 0 }, null, DT);
    expect(state.initialised).toBe(false);
  });

  const start = filterStep(INITIAL_FILTER_STATE, facing(0), { x: 0, y: 0, z: 0 }, DT);

  test('holding still: compass jitter of ±3° is smoothed to well under a degree', () => {
    const n = noise(7);
    const { headings } = run(600, () => facing(3 * n()), () => ({ x: 0, y: 0, z: 0 }), start);
    expect(Math.max(...headings.map((h) => Math.abs(angleDiff(h, 0))))).toBeLessThan(0.6);
  });

  test('turning: follows the gyro with no lag, even while the reference lags behind', () => {
    // Turn right at 60°/s for 1 s. Upright, world up is device +y, and turning right (clockwise
    // from above) is a negative rotation about it.
    const rate = -60 * DEG;
    const { headings } = run(
      60,
      (i) => facing(Math.max(0, (i - 6) * DT * 60)), // reference 100 ms late: it says 54° at the end
      () => ({ x: 0, y: rate, z: 0 }),
      start,
    );
    expect(headings[59]!).toBeGreaterThan(58.5);
    expect(headings[59]!).toBeLessThan(60.5);
  });

  test('a 20° compass jump moves the anchor frame by under 3° in the first second', () => {
    const still = () => ({ x: 0, y: 0, z: 0 });
    const settled = run(120, () => facing(0), still).state;
    const { headings } = run(60, () => facing(20), still, settled);
    expect(Math.abs(headings[59]!)).toBeLessThan(3);
    // ...and it does follow a real, lasting change eventually
    const later = run(60 * 40, () => facing(20), still, settled).headings;
    expect(later[later.length - 1]!).toBeCloseTo(20, 0);
  });

  test('gyro bias of 0.5°/s leaves a bounded heading error, not a growing one', () => {
    const { headings } = run(60 * 60, () => facing(0), () => ({ x: 0, y: 0.5 * DEG, z: 0 }));
    expect(Math.abs(angleDiff(headings[headings.length - 1]!, 0))).toBeLessThan(5);
  });

  test('a disagreement over 60° snaps to the reference', () => {
    const settled = run(60, () => facing(0), () => ({ x: 0, y: 0, z: 0 })).state;
    const { headings } = run(1, () => facing(120), () => ({ x: 0, y: 0, z: 0 }), settled);
    expect(headings[0]).toBeCloseTo(120);
  });

  test('without a gyroscope: jitter is smoothed, a real turn is followed at once', () => {
    const n = noise(3);
    const still = run(600, () => facing(0.5 * n()), () => null).headings.slice(300);
    expect(Math.max(...still.map((h) => Math.abs(angleDiff(h, 0))))).toBeLessThan(0.4);
    const settled = run(60, () => facing(0), () => null).state;
    const turned = run(3, () => facing(30), () => null, settled).headings;
    expect(turned[2]!).toBeGreaterThan(29);
  });
});
