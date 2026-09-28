import * as SecureStore from 'expo-secure-store';

/**
 * How overlays are anchored (D-036), chosen in Settings:
 * - `stabilised`: gyro complementary filter, pinhole projection with the real preview crop, and
 *   HAZARD_A marker correction. The default.
 * - `legacy`: the original maths (raw rotation vector, linear 50° mapping, no marker). Kept as a
 *   fallback in case the new maths misbehaves on a particular phone.
 */
export type AnchoringMode = 'stabilised' | 'legacy';

// A device preference, not a secret; the secure store is simply the synchronous key-value store
// the app already has, so this needs no database migration.
const KEY = 'anchoring_mode_v1';

export function getAnchoringMode(): AnchoringMode {
  try {
    return SecureStore.getItem(KEY) === 'legacy' ? 'legacy' : 'stabilised';
  } catch {
    return 'stabilised';
  }
}

export function setAnchoringMode(mode: AnchoringMode): void {
  SecureStore.setItem(KEY, mode);
}
