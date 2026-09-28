import { SensorType, useAnimatedSensor, useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { cameraDirection, fromReanimatedRotation, quatNormalize, type Direction, type Quaternion } from '@/core/orientation';
import { filterStep, type FilterState } from '@/core/orientationFilter';

import type { AnchoringMode } from './anchoringSetting';

export interface CameraDirection {
  /** Where the back camera points, updated on the UI thread; read it in worklets. */
  direction: SharedValue<Direction>;
  /** The device orientation (device → East-North-Up) behind `direction`, for projection. */
  orientation: SharedValue<Quaternion>;
  /** False on phones without a rotation-vector sensor: overlays then stay fixed on screen. */
  available: boolean;
  /** A gyroscope was found; without one the filter falls back to smoothing the rotation vector. */
  gyroAvailable: boolean;
  /** The latest direction, for JS-thread decisions (hold samples, placement, headings). */
  read: () => Direction;
  readOrientation: () => Quaternion;
  /** The raw rotation vector (compass-fused, unfiltered): what legacy anchoring uses. */
  readReference: () => Quaternion;
  /** Angular speed, degrees per second (0 in legacy mode). */
  readSpeed: () => number;
  /** Angle between the filtered and the raw orientation, degrees (debug overlay, D-039). */
  readDisagreement: () => number;
}

/** Phone held upright in portrait, back camera facing the sensor's north: the resting orientation. */
const UPRIGHT: Quaternion = { qw: Math.SQRT1_2, qx: Math.SQRT1_2, qy: 0, qz: 0 };

/**
 * Where the back camera points (3DoF, D-027). `stabilised` (D-036, the default) fuses the
 * gyroscope with the rotation vector in a complementary filter (core/orientationFilter.ts), so
 * compass jumps near steel no longer drag the overlays; `legacy` uses the raw rotation vector.
 */
export function useCameraDirection(mode: AnchoringMode): CameraDirection {
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const gyro = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 16 });
  const available = rotation.isAvailable;
  const gyroAvailable = gyro.isAvailable;
  const withGyro = mode === 'stabilised' && gyroAvailable;
  const state = useSharedValue<FilterState>({ q: UPRIGHT, initialised: false, speedDegPerSec: 0, refDisagreeDeg: 0 });
  const reference = useSharedValue<Quaternion>(UPRIGHT);

  useFrameCallback((frame) => {
    'worklet';
    if (!available) return;
    const raw = fromReanimatedRotation(rotation.sensor.value);
    const n = raw.qw * raw.qw + raw.qx * raw.qx + raw.qy * raw.qy + raw.qz * raw.qz;
    if (n > 0.25) reference.value = quatNormalize(raw);
    if (mode === 'legacy') {
      if (n > 0.25) state.value = { q: reference.value, initialised: true, speedDegPerSec: 0, refDisagreeDeg: 0 };
      return;
    }
    const g = gyro.sensor.value;
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    state.value = filterStep(state.value, raw, withGyro ? { x: g.x, y: g.y, z: g.z } : null, dt);
  });

  const orientation = useDerivedValue<Quaternion>(() => state.value.q);
  const direction = useDerivedValue<Direction>(() => {
    // Legacy behaviour without a sensor: a fixed straight-ahead direction
    if (!available) return { headingDeg: 0, elevationDeg: 0 };
    return cameraDirection(state.value.q);
  });
  return {
    direction,
    orientation,
    available,
    gyroAvailable,
    read: () => direction.get(),
    readOrientation: () => orientation.get(),
    readReference: () => reference.get(),
    readSpeed: () => state.get().speedDegPerSec,
    readDisagreement: () => state.get().refDisagreeDeg,
  };
}
