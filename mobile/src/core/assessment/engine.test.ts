import fireJson from '@content/scenarios/FIRE_01.json';
import gasJson from '@content/scenarios/GAS_01.json';
import { describe, expect, test } from 'vitest';

import { loadScenario } from '../scenarios/load';
import type { JsonObject } from '../scenarios/types';
import { evaluate, roundPercent, sortByTime } from './engine';
import { buildAttemptResult, sortRulesForDisplay } from './result';
import type { AttemptEvent, Evaluation } from './types';

const FIRE = loadScenario(fireJson);
const GAS = loadScenario(gasJson);

/** Writes events the way the ScenarioPlayer does: one step at a time, times in seconds. */
class Run {
  readonly events: AttemptEvent[] = [];
  t = 0;

  private push(type: AttemptEvent['type'], stepId?: string, data?: JsonObject): this {
    this.events.push({ t: Math.round(this.t * 100) / 100, type, ...(stepId ? { stepId } : {}), ...(data ? { data } : {}) });
    return this;
  }

  /** Start a step, wait `sec`, record `during` (at the end), complete it. */
  step(stepId: string, sec: number, during: (r: Run) => void = () => {}, completedData?: JsonObject): this {
    this.push('step_started', stepId);
    this.t += sec;
    during(this);
    return this.push('step_completed', stepId, completedData);
  }
  skip(stepId: string): this {
    return this.push('step_skipped', stepId);
  }
  choice(stepId: string, option: string): this {
    return this.push('choice_made', stepId, { option });
  }
  choices(stepId: string, options: string[]): this {
    return this.push('choice_made', stepId, { options });
  }
  forbidden(stepId: string, tag: string): this {
    return this.push('forbidden_action', stepId, { tag });
  }
  /** `zones` has one entry per 0.25 s sample; onTargetSec is cumulative (D-028). */
  hold(stepId: string, zones: string[], targetZone: string): this {
    let onTarget = 0;
    for (const zone of zones) {
      if (zone === targetZone) onTarget += 0.25;
      this.push('hold_progress', stepId, { zone, onTargetSec: onTarget });
    }
    return this;
  }
  event(type: AttemptEvent['type'], stepId?: string, data?: JsonObject): this {
    return this.push(type, stepId, data);
  }
}

interface FireOptions {
  extinguisher?: string;
  forbiddenTag?: string;
  alarmLast?: boolean;
  holdZones?: string[];
  evacuateSec?: number;
}

const ON_BASE_5S = Array<string>(20).fill('FireBase');

function fireRun(o: FireOptions = {}): Run {
  const r = new Run();
  const alarm = () => r.step('raise_alarm', 5, (x) => x.event('target_hit', 'raise_alarm', { target: 'AlarmCallPoint' }));
  r.step('brief', 5).step('place_fire', 5, undefined, { x: 0.5, y: 0.7 });
  if (!o.alarmLast) alarm();
  r.step('find_exit', 10, (x) => x.event('marker_found', 'find_exit', { marker: 'EXIT_A' }));
  r.step('pick_extinguisher', 5, (x) => {
    x.choice('pick_extinguisher', o.extinguisher ?? 'water');
    if (o.forbiddenTag) x.forbidden('pick_extinguisher', o.forbiddenTag);
  });
  r.step('approach', 10, (x) => x.event('position_reached', 'approach', { anchor: 'AttackSpot', distanceM: 0.8 }), { exitBehind: true });
  r.step('extinguish', 10, (x) => x.hold('extinguish', o.holdZones ?? ON_BASE_5S, 'FireBase'));
  r.step('escalation', 5, (x) => x.choice('escalation', 'evacuate_alert'));
  r.step('evacuate', o.evacuateSec ?? 35, (x) => x.event('position_reached', 'evacuate', { anchor: 'EXIT_A', distanceM: 1 }));
  r.step('assembly', 5, (x) => x.choice('assembly', 'report_headcount'));
  if (o.alarmLast) alarm();
  return r;
}

interface GasOptions {
  variant: 'minor' | 'major';
  ppe?: string[];
  ppeForbidden?: boolean;
  zoneRadius?: number;
}

function gasRun(o: GasOptions): Run {
  const r = new Run();
  r.step('brief', 5).step('place_area', 5);
  r.step('ppe', 10, (x) => {
    x.choices('ppe', o.ppe ?? ['self_rescuer', 'gas_detector', 'helmet_cap_lamp']);
    if (o.ppeForbidden) x.forbidden('ppe', 'contraband');
  });
  r.step('buddy_check', 10, (x) =>
    x.choices('buddy_check', ['detector_on', 'self_rescuer_carried', 'lamp_working', 'hand_signals_agreed']),
  );
  r.step('detect', 10, (x) => x.event('position_reached', 'detect', { anchor: 'LeakSource', distanceM: 1.4 }));
  r.step('mark_zone', 10, (x) => x.event('zone_marked', 'mark_zone', { radiusM: o.zoneRadius ?? (o.variant === 'minor' ? 1.5 : 2.5) }));
  r.step('ignition_trap', 5, (x) => x.choice('ignition_trap', 'do_not_touch'));
  if (o.variant === 'major') r.step('self_rescuer', 5, (x) => x.choice('self_rescuer', 'don_now'));
  else r.skip('self_rescuer');
  r.step('enter_or_retreat', 5, (x) => x.choice('enter_or_retreat', 'retreat_signal'));
  r.step('retreat', 30);
  r.step('report', 5, (x) => x.choice('report', 'report_barricade'));
  return r;
}

function rule(e: Evaluation, id: string) {
  const found = e.rules.find((r) => r.ruleId === id);
  if (found === undefined) throw new Error(`rule ${id} not in result`);
  return found;
}

describe('docs/03 required tests', () => {
  test('1. perfect FIRE_01 ordinary run -> 100, passed', () => {
    const e = evaluate(FIRE, 'ordinary', fireRun().events);
    expect(e.scorePercent).toBe(100);
    expect(e.passed).toBe(true);
    expect(e.criticalFailures).toEqual([]);
    expect(e.rules.every((r) => r.earned === r.max && r.passed)).toBe(true);
  });

  test('2. alarm after extinguish -> critical failure, passed=false even with score >= 70', () => {
    const e = evaluate(FIRE, 'ordinary', fireRun({ alarmLast: true }).events);
    expect(rule(e, 'R_ALARM_BEFORE_FIGHT').earned).toBe(0);
    expect(e.criticalFailures).toEqual(['R_ALARM_BEFORE_FIGHT']);
    expect(e.scorePercent).toBe(90);
    expect(e.passed).toBe(false);
  });

  test('3. oil variant picks water-type -> R_RIGHT_EXTINGUISHER fails critical', () => {
    const e = evaluate(FIRE, 'oil', fireRun({ extinguisher: 'water', forbiddenTag: 'water_on_oil' }).events);
    expect(rule(e, 'R_RIGHT_EXTINGUISHER')).toMatchObject({ earned: 0, critical: true, passed: false });
    expect(e.criticalFailures).toContain('R_RIGHT_EXTINGUISHER');
    expect(e.passed).toBe(false);
  });

  test('4. ordinary variant picks water-type -> full points', () => {
    const e = evaluate(FIRE, 'ordinary', fireRun({ extinguisher: 'water' }).events);
    expect(rule(e, 'R_RIGHT_EXTINGUISHER')).toMatchObject({ earned: 15, max: 15, passed: true });
  });

  test('5. hold with onTarget 5 s but offTargetRatio 0.6 -> half points', () => {
    const zones = [...ON_BASE_5S, ...Array<string>(30).fill('FlameTop')]; // 20 on, 30 off: ratio 0.6
    const e = evaluate(FIRE, 'ordinary', fireRun({ holdZones: zones }).events);
    expect(rule(e, 'R_AIM_BASE')).toMatchObject({ earned: 7, max: 15, passed: false }); // floor(15 / 2)
  });

  test('6. evacuate in 61 s -> time rule 0, others unaffected', () => {
    const e = evaluate(FIRE, 'ordinary', fireRun({ evacuateSec: 61 }).events);
    expect(rule(e, 'R_EVACUATE_TIME').earned).toBe(0);
    expect(e.rules.filter((r) => r.ruleId !== 'R_EVACUATE_TIME').every((r) => r.earned === r.max)).toBe(true);
    expect(e.scorePercent).toBe(90);
    expect(e.passed).toBe(true);
  });

  test('7. GAS_01 minor: self-rescuer rules skipped; max total excludes them', () => {
    const e = evaluate(GAS, 'minor', gasRun({ variant: 'minor' }).events);
    const ids = e.rules.map((r) => r.ruleId);
    expect(ids).not.toContain('R_SELF_RESCUER');
    expect(ids).not.toContain('R_ORDER_RESCUER_RETREAT');
    expect(e.rules.reduce((sum, r) => sum + r.max, 0)).toBe(85);
    expect(e.scorePercent).toBe(100);
    expect(e.passed).toBe(true);
  });

  test('8. GAS_01 PPE partial: 3 right + dust mask -> floor(15 x 2/3) = 10', () => {
    const ppe = ['self_rescuer', 'gas_detector', 'helmet_cap_lamp', 'dust_mask'];
    const e = evaluate(GAS, 'major', gasRun({ variant: 'major', ppe }).events);
    expect(rule(e, 'R_PPE')).toMatchObject({ earned: 10, max: 15, passed: true });
    expect(e.criticalFailures).toEqual([]);
  });

  test('9. GAS_01 PPE with matches -> critical failure', () => {
    const ppe = ['self_rescuer', 'gas_detector', 'helmet_cap_lamp', 'matches_lighter'];
    const e = evaluate(GAS, 'major', gasRun({ variant: 'major', ppe, ppeForbidden: true }).events);
    expect(rule(e, 'R_PPE').passed).toBe(false);
    expect(e.criticalFailures).toEqual(['R_PPE']);
    expect(e.passed).toBe(false);
  });

  test('10. zone_accuracy at exactly tolerance -> full; at 1.5x -> half; at 2.1x -> 0', () => {
    // minor: true radius 1.5 m, tolerance 0.5 m
    const points = (radius: number) => rule(evaluate(GAS, 'minor', gasRun({ variant: 'minor', zoneRadius: radius }).events), 'R_ZONE_ACCURACY').earned;
    expect(points(1.5 + 0.5)).toBe(15);
    expect(points(1.5 + 0.75)).toBe(7);
    expect(points(1.5 + 1.05)).toBe(0);
    expect(points(1.5 - 0.5)).toBe(15);
  });

  test('11. events out of chronological order -> engine sorts by t stably first', () => {
    const events = fireRun().events;
    const shuffled = [...events].reverse();
    expect(evaluate(FIRE, 'ordinary', shuffled)).toEqual(evaluate(FIRE, 'ordinary', events));
    // Stable: equal times keep their recorded order
    const tied: AttemptEvent[] = [
      { t: 1, type: 'step_started', stepId: 'a' },
      { t: 1, type: 'step_completed', stepId: 'a' },
      { t: 0, type: 'step_started', stepId: 'b' },
    ];
    expect(sortByTime(tied).map((e) => `${e.stepId}:${e.type}`)).toEqual(['b:step_started', 'a:step_started', 'a:step_completed']);
  });

  test('12. same inputs twice -> byte-identical serialized result', () => {
    const attempt = {
      attemptId: '0191f6a0-0000-7000-8000-000000000001',
      scenario: FIRE,
      variant: 'oil',
      seed: 123457,
      mode: 'ar' as const,
      startedAt: 1789000000,
      durationSec: 112.456,
      events: fireRun({ extinguisher: 'dcp' }).events,
    };
    const a = buildAttemptResult(attempt);
    const b = buildAttemptResult(structuredClone(attempt));
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
    expect(a.eventsJson).toBe(b.eventsJson);
    expect(a.result.eventsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.result.durationSec).toBe(112.46);
  });

  test('13. attempt_aborted -> passed=false', () => {
    const run = fireRun();
    run.event('attempt_aborted');
    const e = evaluate(FIRE, 'ordinary', run.events);
    expect(e.scorePercent).toBe(100); // still computed for feedback
    expect(e.passed).toBe(false);
  });
});

describe('scoring details', () => {
  test('scorePercent rounds half away from zero (D-022)', () => {
    expect(roundPercent(33, 40)).toBe(83); // 82.5
    expect(roundPercent(185, 200)).toBe(93); // 92.5
    expect(roundPercent(1, 3)).toBe(33);
    expect(roundPercent(2, 3)).toBe(67);
    expect(roundPercent(0, 0)).toBe(0);
  });

  test('criticalOn forbidden: a wrong pick without a forbidden action only loses points', () => {
    const e = evaluate(FIRE, 'oil', fireRun({ extinguisher: 'co2' }).events);
    expect(rule(e, 'R_RIGHT_EXTINGUISHER')).toMatchObject({ earned: 0, passed: true });
    expect(e.criticalFailures).toEqual([]);
  });

  test('a critical rule without criticalOn fails on 0 points', () => {
    const run = fireRun();
    const escalation = run.events.find((ev) => ev.type === 'choice_made' && ev.stepId === 'escalation')!;
    escalation.data = { option: 'collect_belongings' };
    const e = evaluate(FIRE, 'ordinary', run.events);
    expect(e.criticalFailures).toEqual(['R_EVACUATE_DECISION']);
  });

  test('GAS_01 major: rescuer before retreat earns the order rule', () => {
    const e = evaluate(GAS, 'major', gasRun({ variant: 'major' }).events);
    expect(rule(e, 'R_ORDER_RESCUER_RETREAT').earned).toBe(5);
    expect(e.scorePercent).toBe(100);
  });

  test('checklist without partial needs the exact set', () => {
    const run = gasRun({ variant: 'minor' });
    const buddy = run.events.find((ev) => ev.type === 'choice_made' && ev.stepId === 'buddy_check')!;
    buddy.data = { options: ['detector_on', 'lamp_working', 'hand_signals_agreed'] };
    expect(rule(evaluate(GAS, 'minor', run.events), 'R_BUDDY_CHECK').earned).toBe(0);
  });

  test('result screen order: failed criticals, then lost points, then the rest', () => {
    const e = evaluate(FIRE, 'ordinary', fireRun({ alarmLast: true, evacuateSec: 61 }).events);
    const order = sortRulesForDisplay(e.rules).map((r) => r.ruleId);
    expect(order.slice(0, 2)).toEqual(['R_ALARM_BEFORE_FIGHT', 'R_EVACUATE_TIME']);
  });
});
