/**
 * D-043 "keep the exit behind you", shown live on the step that scores it (a `move_to` with
 * `exitBehind`) and on an `operate_extinguisher` step right after it, where the worker keeps
 * facing the fire. The exit's direction comes from scanning its marker in an earlier
 * `find_marker` step; a run without that step (a refresher drops `find_exit`, D-044) has no exit
 * direction, so the indicator is hidden rather than pointing at nothing.
 */
import type { Step } from '../scenarios/types';

interface ExitBehind {
  marker: string;
  minAngleDeg: number;
}

function exitBehindOf(step: Step | undefined): ExitBehind | null {
  const e = step?.params.exitBehind;
  if (e === null || e === undefined || typeof e !== 'object' || Array.isArray(e)) return null;
  return typeof e.marker === 'string' && typeof e.minAngleDeg === 'number' ? { marker: e.marker, minAngleDeg: e.minAngleDeg } : null;
}

/** The `minAngleDeg` to check live on `steps[index]`, or null when no indicator is shown. */
export function exitIndicatorMinAngle(steps: readonly Step[], index: number): number | null {
  const step = steps[index];
  if (step === undefined) return null;
  const e = exitBehindOf(step) ?? (step.interaction === 'operate_extinguisher' ? exitBehindOf(steps[index - 1]) : null);
  if (e === null) return null;
  const scanned = steps.slice(0, index).some((s) => s.interaction === 'find_marker' && s.params.marker === e.marker);
  return scanned ? e.minAngleDeg : null;
}
