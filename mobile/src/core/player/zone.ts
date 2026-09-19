/**
 * `mark_zone` in camera mode (D-031). Cones are tapped on the placed overlay and measured in the
 * prefab's metre scale (`metresPerDeg`), because overlays are anchored by direction only (D-027).
 * The detector reading is simulated from the scenario's own levels; nothing here is safety content.
 */
import { angleDiff } from '../orientation';
import type { JsonObject, Scenario } from '../scenarios/types';
import { findVariant, resolveParams } from '../scenarios/variants';
import type { Offset, Prefab } from './prefabs';

export interface Detector {
  peakReading: number;
  alertLevel: number;
}

/** Metres from the named hazard object to a point on the overlay. */
export function distanceM(prefab: Prefab, hazard: string, at: Offset): number {
  const h = prefab.objects[hazard];
  if (h === undefined || prefab.metresPerDeg === undefined) throw new Error(`prefab has no ${hazard} or no metre scale`);
  return Math.hypot(angleDiff(at.dh, h.dh), at.de - h.de) * prefab.metresPerDeg;
}

/** `zone_marked.radiusM`: the mean distance of the cones from the hazard, to 2 decimals. */
export function markedRadiusM(prefab: Prefab, hazard: string, cones: readonly Offset[]): number {
  if (cones.length === 0) throw new Error('no cones placed');
  const mean = cones.reduce((sum, c) => sum + distanceM(prefab, hazard, c), 0) / cones.length;
  return Math.round(mean * 100) / 100;
}

/**
 * Simulated reading at a distance from the leak: `peakReading` at the source, falling linearly to
 * `alertLevel` at the alert radius (the step's `trueRadiusM`), never below 0.
 */
export function readingAt(distance: number, detector: Detector, alertRadiusM: number): number {
  const perMetre = (detector.peakReading - detector.alertLevel) / alertRadiusM;
  return Math.max(0, Math.round(detector.peakReading - perMetre * distance));
}

/** The detector of the `move_to` step that approaches `hazard` (docs/02 `detector`), for this variant. */
export function hazardDetector(scenario: Scenario, variantId: string, hazard: string): Detector | null {
  const variant = findVariant(scenario, variantId);
  for (const step of scenario.steps) {
    if (step.interaction !== 'move_to') continue;
    const params = resolveParams(step.params, variant);
    const d = params.detector as JsonObject | undefined;
    if (params.anchor === hazard && typeof d?.peakReading === 'number' && typeof d.alertLevel === 'number') {
      return { peakReading: d.peakReading, alertLevel: d.alertLevel };
    }
  }
  return null;
}
