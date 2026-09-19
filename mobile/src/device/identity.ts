import * as SecureStore from 'expo-secure-store';

import * as b64 from '@/core/certificates/base64url';
import { ed } from '@/core/certificates/ed25519';
import { insertDevice, getDevice, type DeviceRecord } from '@/db/device';
import { newId, nowSeconds } from '@/db/database';
import { randomBytes } from '@/platform/random';

// The device Ed25519 seed never leaves the device (docs/04 "Keys"). It lives in the Android
// Keystore-backed secure store, not in SQLite (mobile/CLAUDE.md). Never log it.
const SEED_KEY = 'device_ed25519_seed_v1';

/** First launch: generate the device key pair and store the device row for this site. */
export function createDevice(siteCode: string): DeviceRecord {
  const existing = getDevice();
  if (existing !== null) return existing;
  const seed = randomBytes(32);
  SecureStore.setItem(SEED_KEY, b64.encode(seed));
  const device: DeviceRecord = {
    id: newId(),
    siteCode,
    publicKey: b64.encode(ed.getPublicKey(seed)),
    attestationToken: null,
    status: 'unregistered',
    createdAt: nowSeconds(),
  };
  insertDevice(device);
  return device;
}

/** The device signing seed; throws if the secure store lost it (then the device must re-register). */
export function deviceSeed(): Uint8Array {
  const text = SecureStore.getItem(SEED_KEY);
  if (text === null) throw new Error('device key missing from secure store');
  return b64.decode(text);
}
