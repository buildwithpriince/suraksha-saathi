import { describe, expect, test } from 'vitest';

import { CAMERA_LONG_SIDE_FOV_DEG, LABEL_BOX_PX, PREVIEW_HFOV_DEG, clampToBand, focalLengthPx, labelBoxDeg } from './layout';

const band = { left: 40, top: 200, right: 350, bottom: 600 };

test('a point inside the band is left alone', () => {
  expect(clampToBand(100, 300, band)).toEqual({ x: 100, y: 300, pinned: false });
});

test('a point off screen or under the card is pinned to the nearest band edge', () => {
  expect(clampToBand(-900, 300, band)).toEqual({ x: 40, y: 300, pinned: true }); // behind, to the left
  expect(clampToBand(100, 50, band)).toEqual({ x: 100, y: 200, pinned: true }); // under the card
  expect(clampToBand(2000, 5000, band)).toEqual({ x: 350, y: 600, pinned: true });
});

describe('preview field of view (D-036)', () => {
  const visibleWidthDeg = (w: number, h: number) => (2 * Math.atan(w / 2 / focalLengthPx(w, h)) * 180) / Math.PI;

  test('a tall phone crops the sides: far less than the legacy 50° is visible across', () => {
    const across = visibleWidthDeg(360, 800); // 20:9
    expect(across).toBeGreaterThan(30);
    expect(across).toBeLessThan(40);
    expect(across).toBeLessThan(PREVIEW_HFOV_DEG);
  });

  test('the full stream height is visible top to bottom when the preview fills the height', () => {
    const visibleHeightDeg = (2 * Math.atan(800 / 2 / focalLengthPx(360, 800)) * 180) / Math.PI;
    expect(visibleHeightDeg).toBeCloseTo(CAMERA_LONG_SIDE_FOV_DEG);
  });

  test('a wide view (tablet) fills the width instead', () => {
    // 3:4 stream shown 900 wide is 1200 tall, more than the 1000 dp view
    const f = focalLengthPx(900, 1000);
    expect(f).toBeCloseTo(1200 / 2 / Math.tan((CAMERA_LONG_SIDE_FOV_DEG * Math.PI) / 360));
  });
});

test('label boxes are widest in degrees on the narrowest screen', () => {
  const narrow = labelBoxDeg();
  expect(narrow.dh).toBeCloseTo(LABEL_BOX_PX.width / (320 / PREVIEW_HFOV_DEG));
  expect(labelBoxDeg(430).dh).toBeLessThan(narrow.dh);
});
