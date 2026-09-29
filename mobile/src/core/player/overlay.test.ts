import { describe, expect, test } from 'vitest';

import { cameraDirection, quatFromRotationVector, quatMultiply, screenOffset, type Quaternion } from '../orientation';
import { overlayPlacement, type OverlayGeometry } from './overlay';

const DEG = Math.PI / 180;
const UPRIGHT: Quaternion = quatFromRotationVector({ x: 90 * DEG, y: 0, z: 0 });
const G: OverlayGeometry = { cx: 180, cy: 400, pxPerDeg: 10, focalPx: 600, pinhole: true };
const ANCHOR = { headingDeg: 8, elevationDeg: -12 };
const FIRE = { dh: 0, de: 6 };

function at(q: Quaternion, g = G) {
  return overlayPlacement(ANCHOR, FIRE, 1, { orientation: q, direction: cameraDirection(q) }, g);
}

describe('overlays are billboards (D-039)', () => {
  test.each([0, 15, -30, 45, 90])('rolling the phone %d° never rotates the sprite', (rollDeg) => {
    const rolled = quatMultiply(UPRIGHT, quatFromRotationVector({ x: 0, y: 0, z: rollDeg * DEG }));
    expect(at(rolled).rotateDeg).toBe(0);
  });

  test('pitch and yaw do not rotate it either', () => {
    const q = quatMultiply(quatFromRotationVector({ x: 0, y: 0, z: -40 * DEG }), quatMultiply(UPRIGHT, quatFromRotationVector({ x: -25 * DEG, y: 0, z: 0 })));
    expect(at(q).rotateDeg).toBe(0);
  });

  test('roll moves the position around the screen centre, keeping the distance from it', () => {
    const level = at(UPRIGHT);
    const rolled = at(quatMultiply(UPRIGHT, quatFromRotationVector({ x: 0, y: 0, z: 30 * DEG })));
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - G.cx, p.y - G.cy);
    expect(dist(rolled)).toBeCloseTo(dist(level), 6);
    expect(rolled.x).not.toBeCloseTo(level.x, 1);
  });

  test('legacy mode keeps the original linear mapping', () => {
    const legacy = { ...G, pinhole: false };
    const p = at(UPRIGHT, legacy);
    const expected = screenOffset({ headingDeg: 8, elevationDeg: -6 }, cameraDirection(UPRIGHT), legacy.pxPerDeg);
    expect(p.x).toBeCloseTo(G.cx + expected.dx);
    expect(p.y).toBeCloseTo(G.cy + expected.dy);
  });
});
