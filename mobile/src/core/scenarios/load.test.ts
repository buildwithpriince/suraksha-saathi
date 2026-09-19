import fire from '@content/scenarios/FIRE_01.json';
import gas from '@content/scenarios/GAS_01.json';
import { describe, expect, test } from 'vitest';

import { ScenarioError, loadScenario } from './load';
import { findVariant, optionForbiddenIn, pickVariant, resolveParams, stepOptions, stepRunsIn } from './variants';

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fireCopy(): Mutable {
  return structuredClone(fire) as Mutable;
}

function problems(json: unknown): string[] {
  try {
    loadScenario(json);
  } catch (e) {
    if (e instanceof ScenarioError) return e.problems;
    throw e;
  }
  return [];
}

describe('the committed scenarios load', () => {
  test.each([
    ['FIRE_01', fire],
    ['GAS_01', gas],
  ])('%s', (id, json) => {
    const s = loadScenario(json);
    expect(s.id).toBe(id);
    expect(s.rules.reduce((sum, r) => sum + r.points, 0)).toBe(100);
  });
});

describe('malformed scenarios are rejected', () => {
  test('rule points not summing to 100', () => {
    const s = fireCopy();
    s.rules[0].points = 9;
    expect(problems(s).join()).toMatch(/points sum to 99/);
  });

  test('unknown interaction type', () => {
    const s = fireCopy();
    s.steps[2].interaction = 'swipe';
    expect(problems(s).join()).toMatch(/unknown interaction swipe/);
  });

  test('rule referencing a missing step', () => {
    const s = fireCopy();
    s.rules[0].params.after = 'extinguish_fire';
    expect(problems(s).join()).toMatch(/unknown step extinguish_fire/);
  });

  test('correct option that the step does not offer', () => {
    const s = fireCopy();
    s.rules.find((r: Mutable) => r.id === 'R_RIGHT_EXTINGUISHER').params.correct.oil = ['foam'];
    expect(problems(s).join()).toMatch(/unknown option foam/);
  });

  test('forbidden option without a tag', () => {
    const s = fireCopy();
    delete s.steps.find((st: Mutable) => st.id === 'escalation').params.options[0].tag;
    expect(problems(s).join()).toMatch(/options\[keep_fighting\]\.tag/);
  });

  test('duplicate step id', () => {
    const s = fireCopy();
    s.steps[1].id = 'brief';
    expect(problems(s).join()).toMatch(/duplicate step id/);
  });

  test('"$name" with no matching variant param', () => {
    const s = fireCopy();
    s.steps[1].params.fireType = '$fuel';
    expect(problems(s).join()).toMatch(/has no param fuel/);
  });

  test('find_marker marker not listed in setup.markers', () => {
    const s = fireCopy();
    s.steps.find((st: Mutable) => st.id === 'find_exit').params.marker = 'EXIT_Z';
    expect(problems(s).join()).toMatch(/EXIT_Z is not in setup.markers/);
  });

  test('per-variant correct map missing a variant', () => {
    const s = fireCopy();
    delete s.rules.find((r: Mutable) => r.id === 'R_RIGHT_EXTINGUISHER').params.correct.ordinary;
    expect(problems(s).join()).toMatch(/no correct options for variant ordinary/);
  });

  test('rule that applies where its step never runs', () => {
    const s = structuredClone(gas) as Mutable;
    delete s.rules.find((r: Mutable) => r.id === 'R_SELF_RESCUER').variants;
    expect(problems(s).join()).toMatch(/applies in minor but step self_rescuer does not run there/);
  });

  test('not an object', () => {
    expect(() => loadScenario([])).toThrow(ScenarioError);
  });
});

describe('variants', () => {
  const fireScenario = loadScenario(fire);
  const gasScenario = loadScenario(gas);

  test('seed picks variants[seed % n]', () => {
    expect(pickVariant(fireScenario, 0).id).toBe('ordinary');
    expect(pickVariant(fireScenario, 123457).id).toBe('oil');
    expect(() => pickVariant(fireScenario, -1)).toThrow();
  });

  test('"$name" is replaced at any depth', () => {
    const detect = gasScenario.steps.find((s) => s.id === 'detect')!;
    const resolved = resolveParams(detect.params, findVariant(gasScenario, 'major'));
    expect(resolved.radiusM).toBe(2.5);
    expect(resolved.detector).toEqual({ peakReading: 100, alertLevel: 40, dangerLevel: 80 });
  });

  test('variant-scoped steps and forbidden options', () => {
    const selfRescuer = gasScenario.steps.find((s) => s.id === 'self_rescuer')!;
    expect(stepRunsIn(selfRescuer, 'minor')).toBe(false);
    expect(stepRunsIn(selfRescuer, 'major')).toBe(true);
    const water = stepOptions(fireScenario.steps.find((s) => s.id === 'pick_extinguisher')!)[0]!;
    expect(optionForbiddenIn(water, 'oil')).toBe(true);
    expect(optionForbiddenIn(water, 'ordinary')).toBe(false);
  });
});
