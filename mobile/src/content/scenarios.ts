import fire from '@content/scenarios/FIRE_01.json';
import gas from '@content/scenarios/GAS_01.json';

import { loadScenario } from '@/core/scenarios/load';
import type { Scenario } from '@/core/scenarios/types';

// Validated once at startup; an invalid bundled scenario is a build bug, so it throws loudly.
const ALL: readonly Scenario[] = [loadScenario(fire), loadScenario(gas)];

/**
 * Scenarios this build can play. Certificates require a pass in each of them (D-029), so with
 * GAS_01 playable (T-30) both docs/04 required modules are needed again.
 */
export const PLAYABLE_SCENARIO_IDS: readonly string[] = ['FIRE_01', 'GAS_01'];

export function getScenario(id: string): Scenario | null {
  return ALL.find((s) => s.id === id) ?? null;
}

export function playableScenarios(): Scenario[] {
  return ALL.filter((s) => PLAYABLE_SCENARIO_IDS.includes(s.id));
}
