import { describe, expect, test } from 'vitest';

import { unixSeconds, uuidv7 } from './ids';

describe('uuidv7', () => {
  const random = Uint8Array.from([0xff, 0x11, 0xff, 1, 2, 3, 4, 5, 6, 7]);

  test('encodes the timestamp, version and variant', () => {
    const id = uuidv7(0x0191f6a00000, random);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.startsWith('0191f6a0-0000-7f11-bf01-')).toBe(true);
  });

  test('sorts by creation time', () => {
    expect(uuidv7(1_789_000_000_000, random) < uuidv7(1_789_000_000_001, random)).toBe(true);
  });

  test('rejects too few random bytes', () => {
    expect(() => uuidv7(1, new Uint8Array(9))).toThrow();
  });
});

test('unixSeconds floors milliseconds', () => {
  expect(unixSeconds(1_789_000_000_999)).toBe(1_789_000_000);
});
