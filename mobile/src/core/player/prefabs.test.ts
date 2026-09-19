import fireJson from '@content/scenarios/FIRE_01.json';
import gasJson from '@content/scenarios/GAS_01.json';
import { describe, expect, test } from 'vitest';

import en from '@/i18n/generated/en.json';

import { loadScenario } from '../scenarios/load';
import { FIRE_SIZE_DEG, labelBoxDeg } from './layout';
import { PREFABS, offsetFrom, zoneAt, type Offset } from './prefabs';

const fire = PREFABS.WorkshopFire!;

test('reticle zones: base, top, none', () => {
  expect(zoneAt(fire, { dh: 0, de: 0 })).toBe('FireBase');
  expect(zoneAt(fire, { dh: 3, de: 10 })).toBe('FlameTop');
  expect(zoneAt(fire, { dh: 20, de: 0 })).toBe('none');
});

test('offsetFrom wraps headings across north', () => {
  expect(offsetFrom({ headingDeg: 355, elevationDeg: -30 }, { headingDeg: 5, elevationDeg: -28 })).toEqual({ dh: 10, de: 2 });
});

describe.each([
  ['FIRE_01', fireJson],
  ['GAS_01', gasJson],
])('%s prefab', (_id, json) => {
  const scenario = loadScenario(json);
  const prefabName = scenario.steps.find((s) => s.interaction === 'place_on_plane')!.params.prefab as string;
  const prefab = PREFABS[prefabName]!;

  test('every target, zone, scene anchor and hazard exists in the prefab', () => {
    expect(prefab).toBeDefined();
    for (const step of scenario.steps) {
      const p = step.params;
      if (step.interaction === 'tap_target') expect(prefab.labels).toHaveProperty(p.target as string);
      if (step.interaction === 'aim_and_hold') {
        expect(prefab.zones).toHaveProperty(p.targetZone as string);
        for (const z of p.offTargetZones as string[]) expect(prefab.zones).toHaveProperty(z);
      }
      if (step.interaction === 'move_to' && !scenario.setup.markers.includes(p.anchor as string)) {
        expect(prefab.paths).toHaveProperty(p.anchor as string);
      }
      if (step.interaction === 'mark_zone') {
        expect(prefab.objects).toHaveProperty(p.hazard as string);
        expect(prefab.metresPerDeg).toBeGreaterThan(0);
      }
    }
  });

  test('labels overlap neither each other nor the fire on the narrowest screen', () => {
    const box = labelBoxDeg();
    const labelled = Object.keys(prefab.labels).map((name) => [name, prefab.objects[name]!] as const);
    const apart = (a: Offset, b: Offset, dh: number, de: number) => Math.abs(a.dh - b.dh) >= dh || Math.abs(a.de - b.de) >= de;
    for (const [i, [name, at]] of labelled.entries()) {
      for (const [other, there] of labelled.slice(i + 1)) {
        expect(apart(at, there, box.dh, box.de), `${name} vs ${other}`).toBe(true);
      }
      const fire = prefab.objects.Fire;
      if (fire !== undefined) {
        expect(apart(at, fire, (box.dh + FIRE_SIZE_DEG) / 2, (box.de + FIRE_SIZE_DEG) / 2), `${name} vs Fire`).toBe(true);
      }
    }
  });

  test('labels, cloud and step effects refer to real objects, keys and steps', () => {
    for (const [name, key] of Object.entries(prefab.labels)) {
      expect(prefab.objects).toHaveProperty(name);
      expect(en).toHaveProperty([key]);
    }
    if (prefab.cloud !== undefined) expect(prefab.objects).toHaveProperty(prefab.cloud.at);
    for (const stepId of Object.keys(prefab.stepEffects ?? {})) {
      expect(scenario.steps.map((s) => s.id)).toContain(stepId);
    }
  });
});
