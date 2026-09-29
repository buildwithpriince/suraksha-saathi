import { Vibration } from 'react-native';

/**
 * Feedback while the extinguisher discharges (D-038). Haptics only for now: a repeating buzz while
 * the lever is held. Sound was left out to avoid a new native dependency before submission; to add
 * a spray loop later, start and stop it here (e.g. an expo-audio player with `loop = true`) and
 * nothing else changes.
 */
export interface DischargeFeedback {
  start(): void;
  stop(): void;
}

/** 70 ms on, 50 ms off, repeated until stopped: reads as a hiss in the hand. */
const PATTERN = [0, 70, 50];

export function createDischargeFeedback(): DischargeFeedback {
  let active = false;
  return {
    start() {
      if (active) return;
      active = true;
      Vibration.vibrate(PATTERN, true);
      // Spray sound: start the looping player here
    },
    stop() {
      if (!active) return;
      active = false;
      Vibration.cancel();
      // Spray sound: stop the looping player here
    },
  };
}
