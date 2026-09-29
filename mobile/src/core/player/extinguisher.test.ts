import fireJson from '@content/scenarios/FIRE_01.json';
import { describe, expect, test } from 'vitest';

import type { AttemptEvent } from '../assessment/types';
import { loadScenario } from '../scenarios/load';
import {
  FIRE_MAX,
  FIRE_START,
  INITIAL_EXTINGUISHER,
  agentEffective,
  extinguisherTick,
  type ExtinguisherConfig,
  type ExtinguisherSample,
  type ExtinguisherState,
} from './extinguisher';
import { HOLD_SAMPLE_SEC } from './session';

const FIRE = loadScenario(fireJson);
const CFG: ExtinguisherConfig = { targetZone: 'FireBase', offTargetZones: ['FlameTop'], dischargeSec: 12, agentEffective: true };
const SWEEP = [-5, -2.5, 0, 2.5, 5, 2.5, 0, -2.5];

/** Runs samples until an outcome or `max` samples; returns the final state and samples used. */
function play(sample: (i: number) => ExtinguisherSample, cfg = CFG, max = 400): { state: ExtinguisherState; samples: number } {
  let state = INITIAL_EXTINGUISHER;
  let i = 0;
  while (state.outcome === null && i < max) {
    state = extinguisherTick(state, sample(i), cfg, HOLD_SAMPLE_SEC);
    i += 1;
  }
  return { state, samples: i };
}

const onBase = (aim: readonly number[]) => (i: number) => ({ discharging: true, zone: 'FireBase', aimDh: aim[i % aim.length]! });

describe('operate_extinguisher fire simulation (D-038)', () => {
  test('sweeping the base puts a fresh fire out, about twice as fast as a static aim', () => {
    const swept = play(onBase(SWEEP));
    const still = play(onBase([0]));
    expect(swept.state.outcome).toBe('extinguished');
    expect(still.state.outcome).toBe('extinguished');
    expect(swept.state.fire).toBe(0);
    expect(still.samples / swept.samples).toBeGreaterThan(1.6);
    // Sweeping: about 5 s; static: about 10 s, still within the 12 s the extinguisher holds
    expect(swept.samples * HOLD_SAMPLE_SEC).toBeLessThan(6.5);
    expect(still.samples * HOLD_SAMPLE_SEC).toBeLessThan(12);
  });

  test('spraying the flame tops never reduces the fire; the extinguisher runs out', () => {
    const { state } = play(() => ({ discharging: true, zone: 'FlameTop', aimDh: 0 }));
    expect(state.outcome).toBe('empty');
    expect(state.fire).toBeGreaterThan(FIRE_START);
  });

  test('a slow worker: the fire grows while nobody sprays it, and goes out of control', () => {
    const idle = play(() => ({ discharging: false, zone: 'none', aimDh: 0 }));
    expect(idle.state.outcome).toBe('out_of_control');
    expect(idle.state.fire).toBe(FIRE_MAX);
    expect(idle.samples * HOLD_SAMPLE_SEC).toBeGreaterThan(30); // time to react first
  });

  test('a late start leaves less margin: after 20 s idle a sweep still wins, a static aim does not', () => {
    const idle = (i: number): ExtinguisherSample => ({ discharging: false, zone: 'none', aimDh: 0 });
    const lateThen = (after: (i: number) => ExtinguisherSample) => (i: number) => (i < 80 ? idle(i) : after(i));
    expect(play(lateThen(onBase(SWEEP))).state.outcome).toBe('extinguished');
    expect(play(lateThen(onBase([0]))).state.outcome).toBe('empty');
  });

  test('the wrong extinguisher never reduces the fire and fails after a second of spraying', () => {
    const { state, samples } = play(onBase(SWEEP), { ...CFG, agentEffective: false });
    expect(state.outcome).toBe('wrong_agent');
    expect(samples).toBe(4);
    expect(state.fire).toBeGreaterThan(FIRE_START);
  });

  test('the state stops changing once there is an outcome', () => {
    const done = play(onBase(SWEEP)).state;
    expect(extinguisherTick(done, { discharging: true, zone: 'FlameTop', aimDh: 0 }, CFG, HOLD_SAMPLE_SEC)).toBe(done);
  });

  test('sprayZone and sweeping describe the last sample', () => {
    let s = INITIAL_EXTINGUISHER;
    for (let i = 0; i < 8; i++) s = extinguisherTick(s, onBase(SWEEP)(i), CFG, HOLD_SAMPLE_SEC);
    expect(s).toMatchObject({ sprayZone: 'FireBase', sweeping: true });
    s = extinguisherTick(s, { discharging: false, zone: 'FireBase', aimDh: 0 }, CFG, HOLD_SAMPLE_SEC);
    expect(s).toMatchObject({ sprayZone: null, sweeping: false });
  });
});

describe('agentEffective: only the scenario says which extinguisher fails', () => {
  const picked = (option: string): AttemptEvent[] => [{ t: 1, type: 'choice_made', stepId: 'pick_extinguisher', data: { option } }];

  test('water on the oil fire is the forbidden pick: no effect', () => {
    expect(agentEffective(FIRE, 'oil', picked('water'), 'pick_extinguisher')).toBe(false);
  });

  test('water on the ordinary fire, and DCP or CO2 on either, work', () => {
    expect(agentEffective(FIRE, 'ordinary', picked('water'), 'pick_extinguisher')).toBe(true);
    for (const option of ['dcp', 'co2']) {
      expect(agentEffective(FIRE, 'oil', picked(option), 'pick_extinguisher')).toBe(true);
      expect(agentEffective(FIRE, 'ordinary', picked(option), 'pick_extinguisher')).toBe(true);
    }
  });

  test('no recorded choice (the pick was skipped): the extinguisher works', () => {
    expect(agentEffective(FIRE, 'oil', [], 'pick_extinguisher')).toBe(true);
  });
});
