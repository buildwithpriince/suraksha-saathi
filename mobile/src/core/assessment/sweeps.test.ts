import { expect, test } from 'vitest';

import { SWEEP_MIN_SWING_DEG, sweepReversals } from './sweeps';

test('left-right-left is two reversals', () => {
  expect(sweepReversals([0, -3, -6, -3, 0, 3, 6, 3, 0, -3, -6])).toBe(2);
});

test('a static aim or a one-way drift has none', () => {
  expect(sweepReversals([])).toBe(0);
  expect(sweepReversals([2, 2, 2, 2])).toBe(0);
  expect(sweepReversals([-6, -3, 0, 3, 6, 9])).toBe(0);
});

test('tremor below the swing threshold never counts', () => {
  const small = SWEEP_MIN_SWING_DEG * 0.9;
  expect(sweepReversals([0, small, 0, small, 0, small, 0])).toBe(0);
});

test('a swing of exactly the threshold counts', () => {
  const a = SWEEP_MIN_SWING_DEG;
  expect(sweepReversals([0, a, 0])).toBe(1);
});

test('reversals are measured from the furthest point reached', () => {
  // Out to 10, back only to 7 (not a reversal), on to 12, back to 6 (a reversal)
  expect(sweepReversals([0, 10, 7, 12, 6])).toBe(1);
});
