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

// --- Debug overlay and camera FOV calibration (D-039) ---------------------------------------------

const DEBUG_KEY = 'anchoring_debug_v1';
const FOV_KEY = 'camera_fov_v1';

export function getDebugOverlay(): boolean {
  try {
    return SecureStore.getItem(DEBUG_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setDebugOverlay(on: boolean): void {
  SecureStore.setItem(DEBUG_KEY, on ? 'on' : 'off');
}

/** The lens FOV used for projection, and where it came from. */
export interface CameraFov {
  longSideFovDeg: number;
  /** `calibrated`: measured on this phone; `default`: the assumed CAMERA_LONG_SIDE_FOV_DEG. */
  source: 'calibrated' | 'default';
  /** Calibration turns averaged (0 for the default). */
  samples: number;
}

export function getCameraFov(defaultDeg: number): CameraFov {
  try {
    const text = SecureStore.getItem(FOV_KEY);
    if (text !== null) {
      const saved = JSON.parse(text) as { longSideFovDeg?: unknown; samples?: unknown };
      if (typeof saved.longSideFovDeg === 'number' && Number.isFinite(saved.longSideFovDeg)) {
        return { longSideFovDeg: saved.longSideFovDeg, source: 'calibrated', samples: Number(saved.samples ?? 1) };
      }
    }
  } catch {
    // unreadable: fall back to the default
  }
  return { longSideFovDeg: defaultDeg, source: 'default', samples: 0 };
}

export function saveCameraFov(longSideFovDeg: number, samples: number): void {
  SecureStore.setItem(FOV_KEY, JSON.stringify({ longSideFovDeg, samples, savedAt: Date.now() }));
}

export function clearCameraFov(): void {
  void SecureStore.deleteItemAsync(FOV_KEY);
}
