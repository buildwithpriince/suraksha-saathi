/**
 * UTF-8 without relying on the engine: Hermes' TextDecoder support varies by release, and docs/04
 * needs a strict decoder (invalid sequences, overlongs, surrogates and a BOM are all errors).
 */

export class InvalidUtf8 extends Error {}

export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) throw new InvalidUtf8('lone surrogate');
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

/** Strict: rejects a BOM, invalid or overlong sequences, surrogates and code points above U+10FFFF. */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new InvalidUtf8('BOM');
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i]!;
    let cp: number;
    let need: number;
    let min: number;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i++;
      continue;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      cp = b0 & 0x1f;
      need = 1;
      min = 0x80;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      cp = b0 & 0x0f;
      need = 2;
      min = 0x800;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      cp = b0 & 0x07;
      need = 3;
      min = 0x10000;
    } else {
      throw new InvalidUtf8('invalid lead byte');
    }
    for (let k = 1; k <= need; k++) {
      const b = bytes[i + k];
      if (b === undefined || (b & 0xc0) !== 0x80) throw new InvalidUtf8('invalid continuation');
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new InvalidUtf8('invalid code point');
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}
