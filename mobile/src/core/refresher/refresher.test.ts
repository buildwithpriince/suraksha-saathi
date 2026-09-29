import fireJson from '@content/scenarios/FIRE_01.json';
import gasJson from '@content/scenarios/GAS_01.json';
import refresherJson from '@content/refresher.json';
import { describe, expect, test } from 'vitest';

import { evaluate } from '../assessment/engine';
import { buildAttemptResult } from '../assessment/result';
import { pickModules } from '../certificates/issue';
import { exitIndicatorMinAngle } from '../player/exitIndicator';
import { ScenarioSession } from '../player/session';
import { loadScenario } from '../scenarios/load';
import { refresherScenario } from './derive';
import { DAY_SECONDS, parseRefresherConfig, refresherStatus, type ScheduleAttempt } from './schedule';

const FIRE = loadScenario(fireJson);
const GAS = loadScenario(gasJson);
const FIRE_R = refresherScenario(FIRE);
const GAS_R = refresherScenario(GAS);

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe('refresherScenario (D-044)', () => {
  // The backend derives the same lists (backend/tests/test_refresher.py); keep the two in step
  test('FIRE_01 keeps its critical steps, the placement and the extinguisher pick', () => {
    expect(ids(FIRE_R.steps)).toEqual(['place_fire', 'raise_alarm', 'pick_extinguisher', 'extinguish', 'escalation']);
    expect(ids(FIRE_R.rules)).toEqual(['R_ALARM_BEFORE_FIGHT', 'R_ALARM_FAST', 'R_RIGHT_EXTINGUISHER', 'R_AIM_BASE', 'R_EVACUATE_DECISION']);
  });

  test('GAS_01 keeps PPE, the ignition trap, the self-rescuer and the retreat decision', () => {
    expect(ids(GAS_R.steps)).toEqual(['place_area', 'ppe', 'ignition_trap', 'self_rescuer', 'enter_or_retreat']);
    expect(ids(GAS_R.rules)).toEqual(['R_PPE', 'R_NO_IGNITION', 'R_SELF_RESCUER', 'R_RETREAT_DECISION']);
  });

  test('every critical rule survives, and the scenario itself is unchanged', () => {
    for (const [full, short] of [
      [FIRE, FIRE_R],
      [GAS, GAS_R],
    ] as const) {
      expect(ids(short.rules)).toEqual(expect.arrayContaining(ids(full.rules.filter((r) => r.critical))));
      expect({ ...short, steps: full.steps, rules: full.rules }).toEqual(full);
    }
  });

  test('a step kept for an exitBehind brings the find_marker that scans its exit', () => {
    const withApproachCritical = {
      ...FIRE,
      rules: FIRE.rules.map((r) => (r.id === 'R_EXIT_BEHIND' ? { ...r, critical: true } : r)),
    };
    expect(ids(refresherScenario(withApproachCritical).steps)).toContain('find_exit');
  });
});

/** The FIRE_01 refresher played through the session, as the training screen plays it. */
function playFireRefresher(variant: 'ordinary' | 'oil', extinguisher: string) {
  let now = 0;
  const tick = (sec: number) => (now += sec);
  const session = new ScenarioSession(FIRE_R, variant, () => now);
  session.start();
  tick(3);
  session.complete({ headingDeg: 10, elevationDeg: -30 }); // place_fire
  tick(5);
  session.record('target_hit', { target: 'AlarmCallPoint' });
  session.complete();
  tick(4);
  session.choose(extinguisher);
  session.pullPin();
  session.startDischarge();
  const aim = [-5, -2.5, 0, 2.5, 5, 2.5, 0, -2.5];
  for (let i = 0; i < 24; i++) {
    tick(0.25);
    session.spraySample('FireBase', aim[i % aim.length]!);
  }
  session.stopDischarge();
  session.finishExtinguisher('extinguished', true);
  tick(3);
  session.choose('evacuate_alert');
  expect(session.finished).toBe(true);
  return session;
}

describe('a refresher plays and scores with the unchanged player and engine', () => {
  test('a perfect FIRE_01 refresher scores 100 over its own rules only', () => {
    const session = playFireRefresher('ordinary', 'dcp');
    const e = evaluate(FIRE_R, 'ordinary', session.events);
    expect(e.scorePercent).toBe(100);
    expect(e.passed).toBe(true);
    expect(e.rules.reduce((sum, r) => sum + r.max, 0)).toBe(60);
    // No event for a dropped step: the run is shorter, not skipped
    expect(session.events.some((ev) => ev.stepId === 'find_exit' || ev.type === 'step_skipped')).toBe(false);
  });

  test('water on the oil fire is still a critical failure', () => {
    const e = evaluate(FIRE_R, 'oil', playFireRefresher('oil', 'water').events);
    expect(e.criticalFailures).toEqual(['R_RIGHT_EXTINGUISHER']);
    expect(e.passed).toBe(false);
  });

  test('the result records kind and stage; training is the default', () => {
    const session = playFireRefresher('ordinary', 'dcp');
    const base = { attemptId: 'a', scenario: FIRE_R, variant: 'ordinary', seed: 0, mode: 'ar' as const, startedAt: 1, durationSec: 30, events: session.events };
    const { result } = buildAttemptResult({ ...base, kind: 'refresher', refresher: { dueDay: 7 } });
    expect(result).toMatchObject({ kind: 'refresher', refresher: { dueDay: 7 }, scenarioId: 'FIRE_01', scenarioVersion: FIRE.version });
    const training = buildAttemptResult({ ...base, scenario: FIRE }).result;
    expect(training.kind).toBe('training');
    expect('refresher' in training).toBe(false);
    expect(() => buildAttemptResult({ ...base, kind: 'refresher' })).toThrow();
    expect(() => buildAttemptResult({ ...base, refresher: { dueDay: 7 } })).toThrow();
  });
});

describe('exit-behind indicator (D-043) in a refresher', () => {
  const index = (steps: readonly { id: string }[], id: string) => steps.findIndex((s) => s.id === id);

  test('full FIRE_01 shows it on the approach and on the extinguish step after it', () => {
    expect(exitIndicatorMinAngle(FIRE.steps, index(FIRE.steps, 'approach'))).toBe(120);
    expect(exitIndicatorMinAngle(FIRE.steps, index(FIRE.steps, 'extinguish'))).toBe(120);
    expect(exitIndicatorMinAngle(FIRE.steps, index(FIRE.steps, 'escalation'))).toBeNull();
  });

  test('the refresher never scanned the exit, so no step shows it', () => {
    FIRE_R.steps.forEach((_, i) => expect(exitIndicatorMinAngle(FIRE_R.steps, i)).toBeNull());
  });

  test('an exitBehind step without its find_marker earlier hides it', () => {
    const steps = FIRE.steps.filter((s) => s.id !== 'find_exit');
    expect(exitIndicatorMinAngle(steps, index(steps, 'approach'))).toBeNull();
    expect(exitIndicatorMinAngle(steps, index(steps, 'extinguish'))).toBeNull();
  });
});

describe('refresher schedule (D-044)', () => {
  const config = parseRefresherConfig(refresherJson);
  const T0 = 1_789_000_000;
  const day = (n: number) => T0 + n * DAY_SECONDS;
  const training = (at: number, passed = true): ScheduleAttempt => ({ scenarioId: 'FIRE_01', startedAt: at, passed, kind: 'training' });
  const refresher = (at: number, dueDay: number, passed = true): ScheduleAttempt => ({
    scenarioId: 'FIRE_01',
    startedAt: at,
    passed,
    kind: 'refresher',
    refresher: { dueDay },
  });

  test('the bundled config is day 7 and day 30', () => {
    expect(config.dueDays).toEqual([7, 30]);
  });

  test('config must be positive, ascending and unique', () => {
    for (const bad of [{}, { dueDays: [] }, { dueDays: [0] }, { dueDays: [7, 7] }, { dueDays: [30, 7] }, { dueDays: [1.5] }]) {
      expect(() => parseRefresherConfig(bad)).toThrow();
    }
  });

  test('nothing before the module is passed', () => {
    expect(refresherStatus('FIRE_01', [training(T0, false)], config, day(40))).toEqual({ due: null, next: null });
  });

  test('due at day 7 from the first pass, then day 30', () => {
    const attempts = [training(T0), training(day(3))]; // a later pass does not move the anchor
    expect(refresherStatus('FIRE_01', attempts, config, day(6))).toEqual({ due: null, next: { dueDay: 7, dueAt: day(7) } });
    expect(refresherStatus('FIRE_01', attempts, config, day(7)).due).toEqual({ dueDay: 7, dueAt: day(7) });
    const afterDay7 = [...attempts, refresher(day(8), 7)];
    expect(refresherStatus('FIRE_01', afterDay7, config, day(9))).toEqual({ due: null, next: { dueDay: 30, dueAt: day(30) } });
    expect(refresherStatus('FIRE_01', afterDay7, config, day(30)).due?.dueDay).toBe(30);
    expect(refresherStatus('FIRE_01', [...afterDay7, refresher(day(31), 30)], config, day(400))).toEqual({ due: null, next: null });
  });

  test('a failed refresher keeps it due', () => {
    expect(refresherStatus('FIRE_01', [training(T0), refresher(day(8), 7, false)], config, day(9)).due?.dueDay).toBe(7);
  });

  test('a missed day 7 folds into day 30', () => {
    const status = refresherStatus('FIRE_01', [training(T0)], config, day(31));
    expect(status).toEqual({ due: { dueDay: 30, dueAt: day(30) }, next: null });
    expect(refresherStatus('FIRE_01', [training(T0), refresher(day(31), 30)], config, day(32)).due).toBeNull();
  });

  test('a passing refresher is not an anchor, and other modules do not count', () => {
    expect(refresherStatus('FIRE_01', [refresher(T0, 7)], config, day(40))).toEqual({ due: null, next: null });
    expect(refresherStatus('GAS_01', [training(T0)], config, day(40))).toEqual({ due: null, next: null });
  });
});

test('a passing refresher never counts towards a certificate (docs/04 step 1)', () => {
  const required = [{ id: 'FIRE_01', version: 3, validityDays: 365 }];
  const base = { scenarioId: 'FIRE_01', scenarioVersion: 3, passed: true };
  expect(pickModules(required, [{ ...base, scorePercent: 100, startedAt: 5, kind: 'refresher' }])).toEqual({ missing: ['FIRE_01'] });
  expect(
    pickModules(required, [
      { ...base, scorePercent: 80, startedAt: 1, kind: 'training' },
      { ...base, scorePercent: 100, startedAt: 5, kind: 'refresher' },
    ]),
  ).toEqual({ mods: [{ id: 'FIRE_01', v: 3, s: 80 }] });
});
