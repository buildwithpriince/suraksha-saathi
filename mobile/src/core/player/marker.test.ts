import { describe, expect, test } from 'vitest';

import { directionToVector, project, quatFromRotationVector, quatMultiply, type Quaternion } from '../orientation';
import { MARKER_MAX_SPEED_DEG_PER_SEC, applySighting, blendDirection, sightingFrom } from './marker';

const DEG = Math.PI / 180;
const VIEW = { cx: 180, cy: 400, focalPx: 600 };

/** Phone upright facing `headingDeg`, tilted down by `downDeg`. */
function pose(headingDeg: number, downDeg: number): Quaternion {
  const upright = quatFromRotationVector({ x: (90 - downDeg) * DEG, y: 0, z: 0 });
  return quatMultiply(quatFromRotationVector({ x: 0, y: 0, z: -headingDeg * DEG }), upright);
}

/** A square marker of `size` px centred where the world direction projects. */
function cornersAt(q: Quaternion, headingDeg: number, elevationDeg: number, size: number) {
  const p = project(directionToVector({ headingDeg, elevationDeg }), q, VIEW.focalPx);
  const x = VIEW.cx + p.dx;
  const y = VIEW.cy + p.dy;
  const h = size / 2;
  return [
    { x: x - h, y: y - h },
    { x: x + h, y: y - h },
    { x: x + h, y: y + h },
    { x: x - h, y: y + h },
  ];
}

describe('marker anchoring (D-036)', () => {
  test('a sighting is the corner centroid and the longest edge', () => {
    const s = sightingFrom([
      { x: 100, y: 100 },
      { x: 180, y: 110 },
      { x: 170, y: 150 },
      { x: 110, y: 140 },
    ]);
    expect(s!.x).toBeCloseTo(140);
    expect(s!.y).toBeCloseTo(125);
    expect(s!.sizePx).toBeCloseTo(Math.hypot(80, 10));
  });

  test('too few corners or too small a marker is ignored', () => {
    expect(sightingFrom(undefined)).toBeNull();
    expect(sightingFrom([{ x: 0, y: 0 }])).toBeNull();
    expect(sightingFrom(cornersAt(pose(0, 30), 0, -30, 10))).toBeNull();
  });

  test('first sighting: the anchor is the marker direction and the scale is 1', () => {
    const q = pose(30, 35);
    const fix = applySighting(sightingFrom(cornersAt(q, 42, -40, 80))!, VIEW, q, 0, { anchor: null, scale: 1, refSizePx: null });
    expect(fix!.anchor.headingDeg).toBeCloseTo(42, 1);
    expect(fix!.anchor.elevationDeg).toBeCloseTo(-40, 1);
    expect(fix!.scale).toBe(1);
    expect(fix!.refSizePx).toBeCloseTo(80);
  });

  test('walking closer: the marker looks twice as big, the overlay heads towards 2x', () => {
    const q = pose(0, 40);
    let current = { anchor: { headingDeg: 0, elevationDeg: -40 }, scale: 1, refSizePx: 80 as number | null };
    for (let i = 0; i < 8; i++) {
      const fix = applySighting(sightingFrom(cornersAt(q, 0, -40, 160))!, VIEW, q, 0, current)!;
      current = { anchor: fix.anchor, scale: fix.scale, refSizePx: fix.refSizePx };
    }
    expect(current.scale).toBeCloseTo(2, 1);
  });

  test('a drifted anchor is pulled onto the marker', () => {
    const q = pose(0, 40);
    let anchor = { headingDeg: 15, elevationDeg: -30 }; // 15° of drift
    for (let i = 0; i < 6; i++) {
      anchor = applySighting(sightingFrom(cornersAt(q, 0, -40, 80))!, VIEW, q, 0, { anchor, scale: 1, refSizePx: 80 })!.anchor;
    }
    expect(Math.abs(anchor.headingDeg > 180 ? anchor.headingDeg - 360 : anchor.headingDeg)).toBeLessThan(0.5);
    expect(anchor.elevationDeg).toBeCloseTo(-40, 0);
  });

  test('sightings while turning fast are skipped (they arrive a frame late)', () => {
    const q = pose(0, 40);
    const s = sightingFrom(cornersAt(q, 0, -40, 80))!;
    expect(applySighting(s, VIEW, q, MARKER_MAX_SPEED_DEG_PER_SEC + 1, { anchor: null, scale: 1, refSizePx: null })).toBeNull();
  });

  test('blending takes the short way round north', () => {
    expect(blendDirection({ headingDeg: 350, elevationDeg: 0 }, { headingDeg: 10, elevationDeg: 10 }, 0.5)).toEqual({ headingDeg: 0, elevationDeg: 5 });
  });
});
