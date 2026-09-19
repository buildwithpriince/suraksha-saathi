import { SensorType, useAnimatedSensor, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { cameraDirection, fromReanimatedRotation, type Direction } from '@/core/orientation';

export interface CameraDirection {
  /** Updated on the UI thread from the rotation sensor; read it in worklets. */
  direction: SharedValue<Direction>;
  /** False on phones without a rotation-vector sensor: overlays then stay fixed on screen. */
  available: boolean;
  /** The latest direction, for JS-thread decisions (hold samples, placement, headings). */
  read: () => Direction;
}

/** Where the back camera points (3DoF, D-027), from Reanimated's rotation sensor. */
export function useCameraDirection(): CameraDirection {
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const available = sensor.isAvailable;
  const direction = useDerivedValue<Direction>(() => {
    if (!available) return { headingDeg: 0, elevationDeg: 0 };
    return cameraDirection(fromReanimatedRotation(sensor.sensor.value));
  });
  return { direction, available, read: () => direction.get() };
}
