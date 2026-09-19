/** Record ids and times (docs/05 "Conventions"). */

/**
 * UUIDv7 (RFC 9562): 48-bit unix-millisecond timestamp, version 7, variant 0b10, 74 random bits.
 * `random` must hold at least 10 bytes; callers pass `expo-crypto` bytes (core has no RNG).
 */
export function uuidv7(nowMs: number, random: Uint8Array): string {
  if (random.length < 10) throw new Error('uuidv7 needs 10 random bytes');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('uuidv7 needs a non-negative integer time');
  const b = new Uint8Array(16);
  let t = nowMs;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | (random[0]! & 0x0f);
  b[7] = random[1]!;
  b[8] = 0x80 | (random[2]! & 0x3f);
  for (let i = 9; i < 16; i++) b[i] = random[i - 6]!;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** UTC unix seconds, the time unit of every record (docs/05). */
export function unixSeconds(nowMs: number): number {
  return Math.floor(nowMs / 1000);
}
