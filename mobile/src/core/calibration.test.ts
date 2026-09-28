import { describe, expect, test } from 'vitest';

import { directionErrorDeg, integrateGyro, isPlausibleLongSideFov, predictedDxPx, solveFocalFromTurn } from './calibration';
import { IDENTITY, angleBetween, quatFromRotationVector, quatMultiply, type Quaternion } from './orientation';
import { focalLengthPx, longSideFovFromFocal, visibleFovDeg } from './player/layout';

const DEG = Math.PI / 180;
/** Device-frame rotations: turning right with the phone upright is a negative turn about device +y. */
const yaw = (deg: number): Quaternion => quatFromRotationVector({ x: 0, y: -deg * DEG, z: 0 });
const pitch = (deg: number): Quaternion => quatFromRotationVector({ x: deg * DEG, y: 0, z: 0 });
const roll = (deg: number): Quaternion => quatFromRotationVector({ x: 0, y: 0, z: deg * DEG });

describe('FOV calibration from a measured turn (D-039)', () => {
  const TRUE_F = 640;

  test.each([
    ['a pure turn right', yaw(15)],
    ['a turn with the phone tipped back 10°', quatMultiply(pitch(10), yaw(18))],
    ['a turn with 5° of roll', quatMultiply(roll(5), yaw(20))],
  ])('%s: the focal length comes back exactly', (_name, turn) => {
    // Where a phone with focal length TRUE_F shows the object after this turn
    const dx = predictedDxPx(turn, TRUE_F);
    expect(dx).toBeLessThan(0); // turned right: the object moved left
    expect(solveFocalFromTurn(turn, dx)).toBeCloseTo(TRUE_F, 6);
  });

  test('too small a turn, or a turn the wrong way, is rejected', () => {
    expect(solveFocalFromTurn(yaw(3), predictedDxPx(yaw(3), TRUE_F))).toBeNull();
    expect(solveFocalFromTurn(yaw(-15), -150)).toBeNull(); // turned left but claims the object is on the left
  });

  test('a 5 px alignment error on a 150 px offset moves the FOV by under 4%', () => {
    const turn = yaw(13);
    const dx = predictedDxPx(turn, TRUE_F);
    const off = solveFocalFromTurn(turn, dx + 5)!;
    expect(Math.abs(off / TRUE_F - 1)).toBeLessThan(0.04);
  });

  test('lens FOV <-> focal length round trip for a measured view', () => {
    const f = focalLengthPx(360, 780, 71.3);
    expect(longSideFovFromFocal(360, 780, f)).toBeCloseTo(71.3, 6);
    expect(visibleFovDeg(360, 780, f).down).toBeCloseTo(71.3, 6); // a tall phone shows the whole long side
    expect(isPlausibleLongSideFov(71.3)).toBe(true);
    expect(isPlausibleLongSideFov(150)).toBe(false);
  });

  test('integrating a constant gyro rate gives the expected turn', () => {
    let q = IDENTITY;
    for (let i = 0; i < 60; i++) q = integrateGyro(q, { x: 0, y: -30 * DEG, z: 0 }, 1 / 60);
    expect(angleBetween(q, yaw(30))).toBeLessThan(1e-6);
  });

  test('directionErrorDeg is the angle between two directions', () => {
    expect(directionErrorDeg({ headingDeg: 10, elevationDeg: 0 }, { headingDeg: 13, elevationDeg: 0 })).toBeCloseTo(3);
    expect(directionErrorDeg({ headingDeg: 359, elevationDeg: 0 }, { headingDeg: 1, elevationDeg: 0 })).toBeCloseTo(2);
    expect(directionErrorDeg({ headingDeg: 0, elevationDeg: 0 }, { headingDeg: 0, elevationDeg: 4 })).toBeCloseTo(4);
  });
});
