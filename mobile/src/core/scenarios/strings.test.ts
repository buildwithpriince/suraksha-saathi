import fire from '@content/scenarios/FIRE_01.json';
import gas from '@content/scenarios/GAS_01.json';
import en from '@/i18n/generated/en.json';
import hi from '@/i18n/generated/hi.json';
import { describe, expect, test } from 'vitest';

import { loadScenario } from './load';
import type { Scenario } from './types';
import { stepOptions } from './variants';

/** Every string key a scenario can put on screen or read aloud, including per-choice feedback (D-042). */
function keysOf(s: Scenario): string[] {
  const keys = [s.titleKey];
  for (const step of s.steps) {
    keys.push(step.instructionKey, step.audioKey, ...stepOptions(step).map((o) => o.labelKey));
  }
  for (const rule of s.rules) {
    keys.push(rule.feedbackKey);
    if (rule.choiceFeedback?.correct !== undefined) keys.push(rule.choiceFeedback.correct);
    keys.push(...Object.values(rule.choiceFeedback?.options ?? {}));
  }
  return keys;
}

describe('scenario string keys exist in en and hi (sat falls back to hi, docs/07)', () => {
  test.each([
    ['FIRE_01', fire],
    ['GAS_01', gas],
  ])('%s', (_id, json) => {
    const keys = keysOf(loadScenario(json));
    expect(keys.filter((k) => !(k in en))).toEqual([]);
    expect(keys.filter((k) => !(k in hi))).toEqual([]);
  });
});
