import * as Crypto from 'expo-crypto';

/** Cryptographically secure random bytes from the OS (core code takes them as arguments). */
export function randomBytes(count: number): Uint8Array {
  return Crypto.getRandomBytes(count);
}
