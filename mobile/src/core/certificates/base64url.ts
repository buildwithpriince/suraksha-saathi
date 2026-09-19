/**
 * base64url without padding (RFC 4648 section 5), decoded strictly and canonically (D-013).
 * Ported from dashboard/src/lib/cert/base64url.ts (D-027); keep the two identical until T-84.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUES = new Map([...ALPHABET].map((c, i) => [c, i]));

export class InvalidBase64 extends Error {}

export function encode(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i]!;
    const b1 = data[i + 1];
    const b2 = data[i + 2];
    out += ALPHABET[b0 >> 2]!;
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]!;
    if (b1 !== undefined) out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]!;
    if (b2 !== undefined) out += ALPHABET[b2 & 63]!;
  }
  return out;
}

/** Accept only A-Z a-z 0-9 - _, no padding, and only the one canonical spelling of the bytes. */
export function decode(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new InvalidBase64('not unpadded base64url');
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let buffer = 0;
  let o = 0;
  for (const ch of text) {
    const v = VALUES.get(ch);
    if (v === undefined) throw new InvalidBase64('not unpadded base64url');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
    buffer &= (1 << bits) - 1;
  }
  // Non-zero leftover bits: "QR" would otherwise decode to the same byte as "QQ"
  if (buffer !== 0) throw new InvalidBase64('non-canonical base64url');
  return out;
}
