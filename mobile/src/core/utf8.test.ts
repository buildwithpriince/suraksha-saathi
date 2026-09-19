import { describe, expect, test } from 'vitest';

import { decodeUtf8Strict, encodeUtf8 } from './utf8';

describe('utf8', () => {
  test.each(['', 'ascii', 'प्रशिक्षण', 'संताली', '😀 emoji', 'ß€'])('round trips %s like TextEncoder', (text) => {
    const bytes = encodeUtf8(text);
    expect(bytes).toEqual(new TextEncoder().encode(text));
    expect(decodeUtf8Strict(bytes)).toBe(text);
  });

  test.each([
    ['BOM', [0xef, 0xbb, 0xbf, 0x7b, 0x7d]],
    ['lone continuation', [0x80]],
    ['truncated', [0xe0, 0xa4]],
    ['overlong', [0xc0, 0xaf]],
    ['overlong 3-byte', [0xe0, 0x80, 0xaf]],
    ['surrogate', [0xed, 0xa0, 0x80]],
    ['above U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
    ['bad lead', [0xff]],
  ])('rejects %s', (_name, bytes) => {
    expect(() => decodeUtf8Strict(Uint8Array.from(bytes))).toThrow();
  });
});
