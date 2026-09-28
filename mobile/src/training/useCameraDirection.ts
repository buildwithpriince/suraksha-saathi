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
  /** The latest direction, for JS-thread decisions (hold samples, placement, headings). */
  read: () => Direction;
  readOrientation: () => Quaternion;
  /** Angular speed, degrees per second (0 in legacy mode). */
  readSpeed: () => number;
}

/** Phone held upright in portrait, back camera facing the sensor's north: the resting orientation. */
const UPRIGHT: Quaternion = { qw: Math.SQRT1_2, qx: Math.SQRT1_2, qy: 0, qz: 0 };

/**
 * Where the back camera points (3DoF, D-027). `stabilised` (D-036) fuses the gyroscope with the
 * rotation vector in a complementary filter (core/orientationFilter.ts), so compass jumps near
 * steel no longer drag the overlays; `legacy` uses the raw rotation vector as before.
 */
export function useCameraDirection(mode: AnchoringMode): CameraDirection {
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const gyro = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 16 });
  const available = rotation.isAvailable;
  const withGyro = mode === 'stabilised' && gyro.isAvailable;
  const state = useSharedValue<FilterState>({ q: UPRIGHT, initialised: false, speedDegPerSec: 0 });

  useFrameCallback((frame) => {
    'worklet';
    if (!available) return;
    const reference = fromReanimatedRotation(rotation.sensor.value);
    if (mode === 'legacy') {
      const n = reference.qw * reference.qw + reference.qx * reference.qx + reference.qy * reference.qy + reference.qz * reference.qz;
      if (n > 0.25) state.value = { q: quatNormalize(reference), initialised: true, speedDegPerSec: 0 };
      return;
    }
    const g = gyro.sensor.value;
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    state.value = filterStep(state.value, reference, withGyro ? { x: g.x, y: g.y, z: g.z } : null, dt);
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
    read: () => direction.get(),
    readOrientation: () => orientation.get(),
    readSpeed: () => state.get().speedDegPerSec,
  };
}
