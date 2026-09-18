import * as ed from "@noble/ed25519";
import * as b64 from "./base64url";

export class InvalidKey extends Error {}

/**
 * True only for the canonical encoding of an Ed25519 point of prime order L (D-015).
 * Small-order and mixed-order keys let anyone forge signatures that verify.
 */
export function isPrimeOrderPoint(raw: Uint8Array): boolean {
  if (raw.length !== 32) return false;
  try {
    const point = ed.Point.fromBytes(raw, false); // strict: rejects non-canonical encodings
    return !point.isSmallOrder() && point.isTorsionFree();
  } catch {
    return false;
  }
}

/** A public key from base64url, or InvalidKey. */
export function publicKeyFromB64url(text: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = b64.decode(text);
  } catch {
    throw new InvalidKey("public key is not canonical base64url");
  }
  if (!isPrimeOrderPoint(raw)) throw new InvalidKey("not a prime-order Ed25519 point");
  return raw;
}

export function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}
