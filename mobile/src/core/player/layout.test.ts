import { expect, test } from 'vitest';

import { LABEL_BOX_PX, PREVIEW_HFOV_DEG, clampToBand, labelBoxDeg } from './layout';

const band = { left: 40, top: 200, right: 350, bottom: 600 };

test('a point inside the band is left alone', () => {
  expect(clampToBand(100, 300, band)).toEqual({ x: 100, y: 300, pinned: false });
});

test('a point off screen or under the card is pinned to the nearest band edge', () => {
  expect(clampToBand(-900, 300, band)).toEqual({ x: 40, y: 300, pinned: true }); // behind, to the left
  expect(clampToBand(100, 50, band)).toEqual({ x: 100, y: 200, pinned: true }); // under the card
  expect(clampToBand(2000, 5000, band)).toEqual({ x: 350, y: 600, pinned: true });
});

test('label boxes are widest in degrees on the narrowest screen', () => {
  const narrow = labelBoxDeg();
  expect(narrow.dh).toBeCloseTo(LABEL_BOX_PX.width / (320 / PREVIEW_HFOV_DEG));
  expect(labelBoxDeg(430).dh).toBeLessThan(narrow.dh);
});
