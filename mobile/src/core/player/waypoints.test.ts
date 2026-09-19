import { expect, test } from 'vitest';

import { tapWaypoint } from './waypoints';

test('taps in path order: the last one is arrival', () => {
  expect(tapWaypoint(0, 0, 3)).toEqual({ reached: 1, arrived: false });
  expect(tapWaypoint(1, 1, 3)).toEqual({ reached: 2, arrived: false });
  expect(tapWaypoint(2, 2, 3)).toEqual({ reached: 3, arrived: true });
});

test('a mark further along counts the ones before it, so none can block the run', () => {
  expect(tapWaypoint(0, 1, 2)).toEqual({ reached: 2, arrived: true });
  expect(tapWaypoint(0, 2, 3)).toEqual({ reached: 3, arrived: true });
});

test('a mark already reached, or one not on the path, does nothing', () => {
  expect(tapWaypoint(1, 0, 2)).toBeNull();
  expect(tapWaypoint(0, 2, 2)).toBeNull();
  expect(tapWaypoint(0, -1, 2)).toBeNull();
});
