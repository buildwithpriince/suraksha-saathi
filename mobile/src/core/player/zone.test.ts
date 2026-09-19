import fireJson from '@content/scenarios/FIRE_01.json';
import gasJson from '@content/scenarios/GAS_01.json';
import { describe, expect, test } from 'vitest';

import { loadScenario } from '../scenarios/load';
import { PREFABS } from './prefabs';
import { distanceM, hazardDetector, markedRadiusM, readingAt } from './zone';

const area = PREFABS.ConfinedAreaEntrance!;
const leak = area.objects.LeakSource!; // { dh: 8, de: 2 }

describe('mark_zone geometry (D-031)', () => {
  test('distance is the angular offset in the overlay metre scale', () => {
    expect(distanceM(area, 'LeakSource', { dh: leak.dh + 10, de: leak.de })).toBeCloseTo(1.5);
    expect(distanceM(area, 'LeakSource', { dh: leak.dh + 6, de: leak.de + 8 })).toBeCloseTo(1.5);
  });

  test('distance wraps headings across north', () => {
    const near = { objects: { H: { dh: 178, de: 0 } }, labels: {}, zones: {}, paths: {}, metresPerDeg: 0.1 };
    expect(distanceM(near, 'H', { dh: -178, de: 0 })).toBeCloseTo(0.4);
  });

  test('the marked radius is the mean cone distance, to 2 decimals', () => {
    const cones = [
      { dh: leak.dh + 10, de: leak.de },
      { dh: leak.dh, de: leak.de - 12 },
      { dh: leak.dh - 8, de: leak.de },
    ];
    expect(markedRadiusM(area, 'LeakSource', cones)).toBe(1.5); // (1.5 + 1.8 + 1.2) / 3
    expect(markedRadiusM(area, 'LeakSource', [{ dh: leak.dh + 3.33333, de: leak.de }])).toBe(0.5);
    expect(() => markedRadiusM(area, 'LeakSource', [])).toThrow();
  });

  test('a prefab without a metre scale or hazard is refused', () => {
    expect(() => distanceM(PREFABS.WorkshopFire!, 'Fire', { dh: 0, de: 0 })).toThrow();
    expect(() => distanceM(area, 'Nowhere', { dh: 0, de: 0 })).toThrow();
  });
});

describe('simulated detector', () => {
  const minor = { peakReading: 60, alertLevel: 40 };

  test('peak at the source, alert level at the alert radius, never below 0', () => {
    expect(readingAt(0, minor, 1.5)).toBe(60);
    expect(readingAt(1.5, minor, 1.5)).toBe(40);
    expect(readingAt(0.75, minor, 1.5)).toBe(50);
    expect(readingAt(100, minor, 1.5)).toBe(0);
  });

  test('levels come from the move_to step that approaches the hazard, per variant', () => {
    const gas = loadScenario(gasJson);
    expect(hazardDetector(gas, 'minor', 'LeakSource')).toEqual({ peakReading: 60, alertLevel: 40 });
    expect(hazardDetector(gas, 'major', 'LeakSource')).toEqual({ peakReading: 100, alertLevel: 40 });
    expect(hazardDetector(gas, 'minor', 'FreshAirPoint')).toBeNull();
    expect(hazardDetector(loadScenario(fireJson), 'oil', 'AttackSpot')).toBeNull();
  });
});
