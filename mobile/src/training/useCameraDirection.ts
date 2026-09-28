import { Platform } from 'react-native';
import { SensorType, useAnimatedSensor, useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import {
  angleBetween,
  cameraDirection,
  conventionStep,
  quatNormalize,
  toDeviceToWorld,
  type ConventionState,
  type Direction,
  type Quaternion,
  type RotationConvention,
  type Vec3,
} from '@/core/orientation';
import { filterStep, updateGyroBias, type FilterState } from '@/core/orientationFilter';

import type { AnchoringMode } from './anchoringSetting';

export interface CameraDirection {
  /** Where the back camera points, updated on the UI thread; read it in worklets. */
  direction: SharedValue<Direction>;
  /** The device orientation (device → world, z up) behind `direction`, for projection. */
  orientation: SharedValue<Quaternion>;
  /** False on phones without a rotation sensor: overlays then stay fixed on screen. */
  available: boolean;
  /** A gyroscope was found; without one the filter falls back to smoothing the rotation sensor. */
  gyroAvailable: boolean;
  /** The latest direction, for JS-thread decisions (hold samples, placement, headings). */
  read: () => Direction;
  readOrientation: () => Quaternion;
  /** The rotation sensor alone (compass-fused, unfiltered), as device → world. */
  readReference: () => Quaternion;
  /** Angular speed, degrees per second (0 in legacy mode). */
  readSpeed: () => number;
  /** Angle between the filtered and the raw orientation, degrees (debug overlay, D-039). */
  readDisagreement: () => number;
  /** How the sensor quaternion is read, and how far its "down" is from measured gravity. */
  readFrameCheck: () => ConventionState;
  /** Estimated gyroscope bias, degrees per second (debug overlay). */
  readGyroBias: () => number;
  /** The bias estimate itself (rad/s, device axes), for code that integrates the gyroscope. */
  gyroBias: SharedValue<Vec3>;
}

/** Phone held upright in portrait, back camera facing the sensor's north: the resting orientation. */
const UPRIGHT: Quaternion = { qw: Math.SQRT1_2, qx: Math.SQRT1_2, qy: 0, qz: 0 };
/**
 * Starting guess for reading the rotation quaternion. Android's is known (fromReanimatedRotation);
 * iOS's is CoreMotion's, and the gravity check picks the right reading within half a second if
 * this guess is wrong (D-039).
 */
const FIRST_GUESS: RotationConvention = Platform.OS === 'android' ? 'android' : 'device-to-world';

/**
 * Where the back camera points (3DoF, D-027). `stabilised` (D-036, the default) fuses the
 * gyroscope with the rotation sensor in a complementary filter (core/orientationFilter.ts);
 * `legacy` uses the rotation sensor alone. Both read the platform's quaternion the way the gravity
 * sensor confirms (D-039), so the same code is right on Android and iOS.
 */
export function useCameraDirection(mode: AnchoringMode): CameraDirection {
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const gyro = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 16 });
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 16 });
  const available = rotation.isAvailable;
  const gyroAvailable = gyro.isAvailable;
  const gravityAvailable = gravity.isAvailable;
  const withGyro = mode === 'stabilised' && gyroAvailable;
  const state = useSharedValue<FilterState>({ q: UPRIGHT, initialised: false, speedDegPerSec: 0, refDisagreeDeg: 0 });
  const reference = useSharedValue<Quaternion>(UPRIGHT);
  const frame = useSharedValue<ConventionState>({ convention: FIRST_GUESS, votes: 0, mismatchDeg: 0 });
  const bias = useSharedValue<Vec3>({ x: 0, y: 0, z: 0 });

  useFrameCallback((info) => {
    'worklet';
    if (!available) return;
    const s = rotation.sensor.value;
    const raw = { qw: s.qw, qx: s.qx, qy: s.qy, qz: s.qz };
    const n = raw.qw * raw.qw + raw.qx * raw.qx + raw.qy * raw.qy + raw.qz * raw.qz;
    if (n < 0.25) return; // the sensor has not reported yet
    const dt = (info.timeSincePreviousFrame ?? 16) / 1000;

    if (gravityAvailable) {
      const g = gravity.sensor.value;
      const checked = conventionStep(frame.value, raw, { x: g.x, y: g.y, z: g.z });
      frame.value = { convention: checked.convention, votes: checked.votes, mismatchDeg: checked.mismatchDeg };
      // A new reading of the quaternion: start the filter again from it
      if (checked.switched) state.value = { ...state.value, initialised: false };
    }
    const ref = quatNormalize(toDeviceToWorld(raw, frame.value.convention));
    const refTurn = dt > 0 ? angleBetween(ref, reference.value) / dt : 0;
    reference.value = ref;

    if (mode === 'legacy') {
      state.value = { q: ref, initialised: true, speedDegPerSec: 0, refDisagreeDeg: 0 };
      return;
    }
    let rate: Vec3 | null = null;
    if (withGyro) {
      const g = gyro.sensor.value;
      const measured = { x: g.x, y: g.y, z: g.z };
      bias.value = updateGyroBias(bias.value, measured, refTurn, dt);
      rate = { x: measured.x - bias.value.x, y: measured.y - bias.value.y, z: measured.z - bias.value.z };
    }
    state.value = filterStep(state.value, ref, rate, dt);
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
    readFrameCheck: () => frame.get(),
    gyroBias: bias,
    readGyroBias: () => {
      const b = bias.get();
      return (Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z) * 180) / Math.PI;
    },
  };
}
