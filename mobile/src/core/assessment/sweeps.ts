/**
 * PASS "Sweep" (D-038): side-to-side reversals of the extinguisher aim across the fire's base.
 * Shared by the scoring engine (from `hold_progress.aimDh` in the event log) and the fire
 * simulation (core/player/extinguisher.ts), so what the worker sees and what is scored agree.
 */

/** A change of direction counts only after the aim has swung at least this far, in degrees. */
export const SWEEP_MIN_SWING_DEG = 4;

/**
 * Reversals in a sequence of horizontal aim angles (degrees, prefab units). Hysteresis: the aim
 * must first move `minSwingDeg` away from where it started, and each reversal must come back
 * `minSwingDeg` from the furthest point, so hand tremor never counts. Left-right-left is 2.
 */
export function sweepReversals(aimDh: readonly number[], minSwingDeg: number = SWEEP_MIN_SWING_DEG): number {
  if (aimDh.length === 0) return 0;
  let direction = 0;
  let extreme = aimDh[0]!;
  let reversals = 0;
  for (const x of aimDh) {
    if (direction === 0) {
      if (Math.abs(x - extreme) >= minSwingDeg) {
        direction = Math.sign(x - extreme);
        extreme = x;
      }
    } else if (direction * (x - extreme) > 0) {
      extreme = x; // still swinging the same way
    } else if (Math.abs(x - extreme) >= minSwingDeg) {
      reversals += 1;
      direction = -direction;
      extreme = x;
    }
  }
  return reversals;
}
