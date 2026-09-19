import fireJson from '@content/scenarios/FIRE_01.json';
import { expect, test } from 'vitest';

import { loadScenario } from '../scenarios/load';
import { PREFABS, offsetFrom, zoneAt } from './prefabs';

const fire = PREFABS.WorkshopFire!;

test('reticle zones: base, top, none', () => {
  expect(zoneAt(fire, { dh: 0, de: 0 })).toBe('FireBase');
  expect(zoneAt(fire, { dh: 3, de: 10 })).toBe('FlameTop');
  expect(zoneAt(fire, { dh: 20, de: 0 })).toBe('none');
});

test('offsetFrom wraps headings across north', () => {
  expect(offsetFrom({ headingDeg: 355, elevationDeg: -30 }, { headingDeg: 5, elevationDeg: -28 })).toEqual({ dh: 10, de: 2 });
});

test('every FIRE_01 target, zone and scene anchor exists in its prefab', () => {
  const scenario = loadScenario(fireJson);
  const prefabName = scenario.steps.find((s) => s.interaction === 'place_on_plane')!.params.prefab as string;
  const prefab = PREFABS[prefabName]!;
  for (const step of scenario.steps) {
    const p = step.params;
    if (step.interaction === 'tap_target') expect(prefab.objects).toHaveProperty(p.target as string);
    if (step.interaction === 'aim_and_hold') {
      expect(prefab.zones).toHaveProperty(p.targetZone as string);
      for (const z of p.offTargetZones as string[]) expect(prefab.zones).toHaveProperty(z);
    }
    if (step.interaction === 'move_to' && !scenario.setup.markers.includes(p.anchor as string)) {
      expect(prefab.paths).toHaveProperty(p.anchor as string);
    }
  }
});
