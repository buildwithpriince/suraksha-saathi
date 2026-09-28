import fireJson from '@content/scenarios/FIRE_01.json';
import gasJson from '@content/scenarios/GAS_01.json';
import { describe, expect, test } from 'vitest';

import { evaluate } from '../assessment/engine';
import { loadScenario } from '../scenarios/load';
import { PREFABS } from './prefabs';
import { ScenarioSession } from './session';
import { tapWaypoint } from './waypoints';
import { markedRadiusM } from './zone';

const FIRE = loadScenario(fireJson);
const GAS = loadScenario(gasJson);

function clockedSession(scenarioVariant: 'ordinary' | 'oil') {
  let now = 0;
  const session = new ScenarioSession(FIRE, scenarioVariant, () => now);
  return { session, tick: (sec: number) => (now += sec) };
}

/** Horizontal aim swinging across the fire base, 5° each way: a reversal every 4 samples. */
const SWEEP_AIM = [-5, -2.5, 0, 2.5, 5, 2.5, 0, -2.5];

/** PASS on the extinguish step: pull the pin, squeeze, spray `samples` × 0.25 s at `zone`. */
function spray(session: ScenarioSession, tick: (sec: number) => void, samples: number, zone = 'FireBase', aim: readonly number[] = SWEEP_AIM) {
  session.pullPin();
  session.startDischarge();
  for (let i = 0; i < samples; i++) {
    tick(0.25);
    session.spraySample(zone, aim[i % aim.length]!);
  }
  session.stopDischarge();
}

/** Plays FIRE_01 through the session API the way the camera screen does. */
function playFire(variant: 'ordinary' | 'oil', extinguisher: string) {
  const { session, tick } = clockedSession(variant);
  session.start();
  tick(4);
  session.complete(); // brief
  tick(3);
  session.complete({ headingDeg: 10, elevationDeg: -30 }); // place_fire
  tick(5);
  session.record('target_hit', { target: 'AlarmCallPoint' });
  session.complete();
  tick(8);
  session.record('marker_found', { marker: 'EXIT_A' });
  session.complete();
  tick(4);
  session.choose(extinguisher);
  tick(9);
  session.record('position_reached', { anchor: 'AttackSpot', distanceM: 0 });
  session.complete({ exitBehind: true });
  spray(session, tick, 24);
  session.finishExtinguisher('extinguished', true);
  tick(3);
  session.choose('evacuate_alert');
  tick(30);
  session.record('position_reached', { anchor: 'EXIT_A', distanceM: null });
  session.complete();
  tick(4);
  session.choose('report_headcount');
  return session;
}

describe('operate_extinguisher gestures (D-038)', () => {
  /** A session on FIRE_01's extinguish step. */
  function atExtinguish() {
    const { session, tick } = clockedSession('ordinary');
    session.start();
    session.complete();
    session.complete({ headingDeg: 10, elevationDeg: -30 });
    session.record('target_hit', { target: 'AlarmCallPoint' });
    session.complete();
    session.record('marker_found', { marker: 'EXIT_A' });
    session.complete();
    session.choose('water');
    session.arrive('AttackSpot', 0, { exitBehind: true });
    expect(session.current()!.step.interaction).toBe('operate_extinguisher');
    return { session, tick };
  }
  const types = (s: ScenarioSession) => s.events.filter((e) => e.stepId === 'extinguish' && e.type !== 'step_started').map((e) => e.type);

  test('the lever is locked until the pin is pulled; the pin is recorded once', () => {
    const { session } = atExtinguish();
    expect(session.startDischarge()).toBe(false);
    session.pullPin();
    session.pullPin();
    expect(session.startDischarge()).toBe(true);
    expect(session.startDischarge()).toBe(false); // already discharging
    session.stopDischarge();
    session.stopDischarge();
    expect(types(session)).toEqual(['pin_pulled', 'discharge_started', 'discharge_stopped']);
  });

  test('pin_pulled records whether the pin was swiped or tapped out; scoring treats both alike', () => {
    for (const method of ['swipe', 'tap'] as const) {
      const { session } = atExtinguish();
      session.pullPin(method);
      expect(session.events.at(-1)).toMatchObject({ type: 'pin_pulled', stepId: 'extinguish', data: { method } });
    }
  });

  test('spray samples carry cumulative onTargetSec and the aim, only while discharging', () => {
    const { session, tick } = atExtinguish();
    session.pullPin();
    expect(() => session.spraySample('FireBase', 0)).toThrow();
    session.startDischarge();
    tick(0.25);
    session.spraySample('FireBase', 3.14);
    tick(0.25);
    session.spraySample('FlameTop', -2);
    tick(0.25);
    session.spraySample('FireBase', 1);
    const samples = session.events.filter((e) => e.type === 'hold_progress').map((e) => e.data);
    expect(samples).toEqual([
      { zone: 'FireBase', onTargetSec: 0.25, aimDh: 3.1 },
      { zone: 'FlameTop', onTargetSec: 0.25, aimDh: -2 },
      { zone: 'FireBase', onTargetSec: 0.5, aimDh: 1 },
    ]);
    expect(session.current()!.step.id).toBe('extinguish'); // samples never complete the step
  });

  test('finishing records the outcome, closes the lever press, and moves on', () => {
    const { session } = atExtinguish();
    session.pullPin();
    session.startDischarge();
    session.finishExtinguisher('wrong_agent', false);
    expect(session.events.slice(-3).map((e) => [e.type, e.data])).toEqual([
      ['discharge_stopped', undefined],
      ['step_completed', { extinguished: false, outcome: 'wrong_agent' }],
      ['step_started', undefined],
    ]);
    expect(session.current()!.step.id).toBe('escalation');
  });

  test('skipping or stopping mid-discharge closes the lever press in the log', () => {
    const { session } = atExtinguish();
    session.pullPin();
    session.startDischarge();
    session.skip();
    expect(session.events.filter((e) => e.stepId === 'extinguish').map((e) => e.type).slice(-2)).toEqual(['discharge_stopped', 'step_skipped']);
  });

  test('extinguisher calls are refused on other steps', () => {
    const { session } = clockedSession('ordinary');
    session.start();
    expect(() => session.pullPin()).toThrow();
    expect(() => session.startDischarge()).toThrow();
    expect(() => session.finishExtinguisher('extinguished', true)).toThrow();
  });
});

describe('reposition (D-036)', () => {
  test('anchor_repositioned is recorded in the current step and changes nothing else', () => {
    const { session, tick } = clockedSession('ordinary');
    session.start();
    tick(2);
    session.reposition(12.345, -31.26);
    expect(session.current()!.step.id).toBe('brief');
    expect(session.events.at(-1)).toEqual({ t: 2, type: 'anchor_repositioned', stepId: 'brief', data: { headingDeg: 12.3, elevationDeg: -31.3 } });
  });

  test('repositioning in every step leaves the score byte-identical', () => {
    const plain = playFire('ordinary', 'water');
    const withMoves = structuredClone(plain.events);
    // Insert a reposition right after every step start, at the same time
    for (let i = withMoves.length - 1; i >= 0; i--) {
      const e = withMoves[i]!;
      if (e.type === 'step_started') withMoves.splice(i + 1, 0, { t: e.t, type: 'anchor_repositioned', stepId: e.stepId, data: { headingDeg: 1, elevationDeg: -2 } });
    }
    expect(withMoves.length).toBeGreaterThan(plain.events.length);
    expect(JSON.stringify(evaluate(FIRE, 'ordinary', withMoves))).toBe(JSON.stringify(evaluate(FIRE, 'ordinary', plain.events)));
  });
});

const AREA = PREFABS.ConfinedAreaEntrance!;

/**
 * Walks a `move_to` path the way the camera screen does: each tap goes through `tapWaypoint`, and
 * arrival goes through `session.arrive`. Returns false if the taps never arrive.
 */
function walk(session: ScenarioSession, taps: number[]): boolean {
  const anchor = String(session.current()!.params.anchor);
  const path = AREA.paths[anchor]!;
  let reached = 0;
  for (const i of taps) {
    const tap = tapWaypoint(reached, i, path.length);
    if (tap === null) continue;
    reached = tap.reached;
    if (tap.arrived) {
      session.arrive(anchor, 0);
      return true;
    }
  }
  return false;
}

interface GasPlay {
  coneDeg?: number;
  ppe?: string[];
  retreatSec?: number;
}

/** A GAS_01 session with one action per step, played the way the camera screen does. */
function gasSession(variant: 'minor' | 'major', o: GasPlay = {}) {
  let now = 0;
  const tick = (sec: number) => (now += sec);
  const session = new ScenarioSession(GAS, variant, () => now);
  const leak = AREA.objects.LeakSource!;
  const coneDeg = o.coneDeg ?? (variant === 'minor' ? 10 : 16.67); // alert radius at 0.15 m per degree
  const actions: Record<string, () => void> = {
    brief: () => session.complete(),
    place_area: () => session.complete({ headingDeg: 40, elevationDeg: -35 }),
    ppe: () => session.chooseMany(o.ppe ?? ['self_rescuer', 'gas_detector', 'helmet_cap_lamp']),
    buddy_check: () => session.chooseMany(['detector_on', 'self_rescuer_carried', 'lamp_working', 'hand_signals_agreed']),
    detect: () => walk(session, [0, 1, 2]),
    mark_zone: () => {
      const cones = [0, 90, 180, 270].map((deg) => ({
        dh: leak.dh + coneDeg * Math.cos((deg * Math.PI) / 180),
        de: leak.de + coneDeg * Math.sin((deg * Math.PI) / 180),
      }));
      session.record('zone_marked', { radiusM: markedRadiusM(AREA, 'LeakSource', cones) });
      session.complete();
    },
    ignition_trap: () => session.choose('do_not_touch'),
    self_rescuer: () => session.choose('don_now'),
    enter_or_retreat: () => session.choose('retreat_signal'),
    retreat: () => {
      tick((o.retreatSec ?? 20) - 5);
      walk(session, [0, 1]);
    },
    report: () => session.choose('report_barricade'),
  };
  session.start();
  return {
    session,
    tick,
    /** Plays steps until `stepId` is current (or to the end). */
    playUntil(stepId?: string) {
      while (!session.finished && session.current()!.step.id !== stepId) {
        tick(5);
        actions[session.current()!.step.id]!();
      }
      return session;
    },
  };
}

function playGas(variant: 'minor' | 'major', coneDeg: number, ppe?: string[]) {
  return gasSession(variant, { coneDeg, ppe }).playUntil();
}

describe('ScenarioSession', () => {
  test.each([
    ['minor', 10], // alert radius 1.5 m at 0.15 m per degree
    ['major', 16.67], // 2.5 m
  ] as const)('a clean GAS_01 %s run with cones on the alert radius scores 100', (variant, coneDeg) => {
    const session = playGas(variant, coneDeg);
    expect(session.finished).toBe(true);
    const e = evaluate(GAS, variant, session.events);
    expect(e.rules.find((r) => r.ruleId === 'R_ZONE_ACCURACY')?.earned).toBe(15);
    expect(e.scorePercent).toBe(100);
    expect(e.passed).toBe(true);
  });

  test('GAS_01 cones 1 m outside the alert radius earn half the zone points', () => {
    const e = evaluate(GAS, 'minor', playGas('minor', 10 + 1 / 0.15).events);
    expect(e.rules.find((r) => r.ruleId === 'R_ZONE_ACCURACY')?.earned).toBe(7);
  });

  test('GAS_01 matches picked on the PPE rack emit contraband and fail critically', () => {
    const session = playGas('minor', 10, ['self_rescuer', 'gas_detector', 'helmet_cap_lamp', 'matches_lighter']);
    expect(session.events).toContainEqual(expect.objectContaining({ type: 'forbidden_action', stepId: 'ppe', data: { tag: 'contraband' } }));
    const e = evaluate(GAS, 'minor', session.events);
    expect(e.criticalFailures).toContain('R_PPE');
    expect(e.passed).toBe(false);
  });

  test('a clean FIRE_01 run scores 100 through the engine', () => {
    const session = playFire('ordinary', 'water');
    expect(session.finished).toBe(true);
    const e = evaluate(FIRE, 'ordinary', session.events);
    expect(e.scorePercent).toBe(100);
    expect(e.passed).toBe(true);
  });

  test('a forbidden option emits forbidden_action with its tag, only in its variants', () => {
    const oil = playFire('oil', 'water');
    expect(oil.events).toContainEqual(expect.objectContaining({ type: 'forbidden_action', stepId: 'pick_extinguisher', data: { tag: 'water_on_oil' } }));
    expect(evaluate(FIRE, 'oil', oil.events).criticalFailures).toContain('R_RIGHT_EXTINGUISHER');
    const ordinary = playFire('ordinary', 'water');
    expect(ordinary.events.some((e) => e.type === 'forbidden_action')).toBe(false);
  });

  test('aim_and_hold still completes after durationSec of samples with cumulative onTargetSec', () => {
    // FIRE_01 v1 shape: the extinguish step as aim_and_hold, R_AIM_BASE without PASS params
    const v1 = structuredClone(fireJson) as unknown as { steps: { id: string; interaction: string; params: object }[]; rules: { id: string; params: object }[] };
    Object.assign(v1.steps.find((st) => st.id === 'extinguish')!, {
      interaction: 'aim_and_hold',
      params: { targetZone: 'FireBase', offTargetZones: ['FlameTop'], durationSec: 10 },
    });
    v1.rules.find((r) => r.id === 'R_AIM_BASE')!.params = { step: 'extinguish', minOnTargetSec: 4, maxOffTargetRatio: 0.4 };
    const scenario = loadScenario(v1);
    let now = 0;
    const session = new ScenarioSession(scenario, 'ordinary', () => now);
    session.start();
    session.complete();
    session.complete({ headingDeg: 10, elevationDeg: -30 });
    session.record('target_hit', { target: 'AlarmCallPoint' });
    session.complete();
    session.record('marker_found', { marker: 'EXIT_A' });
    session.complete();
    session.choose('water');
    session.arrive('AttackSpot', 0, { exitBehind: true });
    for (let i = 0; i < 40; i++) {
      now += 0.25;
      session.holdSample('FireBase'); // a static aim: no sweeps, and none required here
    }
    const holds = session.events.filter((e) => e.type === 'hold_progress');
    expect(holds).toHaveLength(40); // durationSec 10 / 0.25
    expect(holds.at(-1)?.data?.onTargetSec).toBe(10);
    expect(session.current()?.step.id).toBe('escalation');
    expect(evaluate(scenario, 'ordinary', session.events).rules.find((r) => r.ruleId === 'R_AIM_BASE')).toEqual(expect.objectContaining({ earned: 15 }));
  });

  test('steps outside the variant are skipped with step_skipped', () => {
    let now = 0;
    const session = new ScenarioSession(GAS, 'minor', () => now);
    session.start();
    const ids = () => session.current()?.step.id;
    session.complete(); // brief
    session.complete(); // place_area
    session.chooseMany(['self_rescuer', 'gas_detector', 'helmet_cap_lamp']);
    session.chooseMany(['detector_on', 'self_rescuer_carried', 'lamp_working', 'hand_signals_agreed']);
    session.complete(); // detect
    session.complete(); // mark_zone
    now = 50;
    session.choose('do_not_touch'); // ignition_trap -> self_rescuer is skipped
    expect(ids()).toBe('enter_or_retreat');
    expect(session.events).toContainEqual({ t: 50, type: 'step_skipped', stepId: 'self_rescuer' });
  });

  test('params are resolved for the variant', () => {
    const session = new ScenarioSession(GAS, 'major', () => 0);
    session.start();
    session.complete();
    session.complete();
    session.chooseMany(['self_rescuer']);
    session.chooseMany(['detector_on']);
    expect(session.current()?.params.radiusM).toBe(2.5);
  });

  test('abort records attempt_aborted and finishes', () => {
    const { session, tick } = clockedSession('ordinary');
    session.start();
    tick(2.345);
    session.abort();
    expect(session.finished).toBe(true);
    expect(session.events.at(-1)).toEqual({ t: 2.35, type: 'attempt_aborted', stepId: 'brief' });
    expect(evaluate(FIRE, 'ordinary', session.events).passed).toBe(false);
  });

  test('wrong interaction calls are refused', () => {
    const { session } = clockedSession('ordinary');
    session.start();
    expect(() => session.holdSample('FireBase')).toThrow();
    expect(() => session.chooseMany(['a'])).toThrow();
  });
});

describe('move_to completion path (GAS_01 retreat)', () => {
  test('tapping the waypoints in order arrives: position_reached, step_completed, next step', () => {
    const { session, playUntil } = gasSession('minor');
    playUntil('retreat');
    expect(session.current()?.params.anchor).toBe('FreshAirPoint');
    expect(walk(session, [0])).toBe(false); // first of two marks: not there yet
    expect(session.current()?.step.id).toBe('retreat');
    const before = session.events.length;
    expect(walk(session, [0, 0, 1])).toBe(true); // the repeated tap on mark 1 is ignored
    expect(session.events.slice(before, before + 2)).toEqual([
      expect.objectContaining({ type: 'position_reached', stepId: 'retreat', data: { anchor: 'FreshAirPoint', distanceM: 0 } }),
      expect.objectContaining({ type: 'step_completed', stepId: 'retreat' }),
    ]);
    expect(session.current()?.step.id).toBe('report');
  });

  test('tapping the last mark first also arrives, so a mark out of reach cannot block the run', () => {
    const { session, playUntil } = gasSession('major');
    playUntil('retreat');
    expect(walk(session, [1])).toBe(true);
    expect(session.current()?.step.id).toBe('report');
  });

  test('arrival within the step time limit earns R_RETREAT_TIME; a slow one does not', () => {
    const fast = gasSession('minor', { retreatSec: 40 }).playUntil();
    const slow = gasSession('minor', { retreatSec: 50 }).playUntil();
    expect(evaluate(GAS, 'minor', fast.events).rules.find((r) => r.ruleId === 'R_RETREAT_TIME')?.earned).toBe(5);
    expect(evaluate(GAS, 'minor', slow.events).rules.find((r) => r.ruleId === 'R_RETREAT_TIME')?.earned).toBe(0);
  });

  test('arrive is refused outside a move_to step', () => {
    const { session } = gasSession('minor');
    expect(() => session.arrive('FreshAirPoint', 0)).toThrow();
  });
});

describe('Skip step (D-033): always a failure, never a pass', () => {
  const rule = (events: Parameters<typeof evaluate>[2], variant: string, id: string, scenario = GAS) =>
    evaluate(scenario, variant, events).rules.find((r) => r.ruleId === id)!;

  test('skip records step_skipped with a reason and moves to the next step', () => {
    const { session, playUntil } = gasSession('minor');
    playUntil('retreat');
    session.skip();
    expect(session.events.at(-2)).toEqual(expect.objectContaining({ type: 'step_skipped', stepId: 'retreat', data: { reason: 'no_progress' } }));
    expect(session.current()?.step.id).toBe('report');
  });

  test('a skipped non-critical step loses its points; the rest of the run still counts', () => {
    const { session, playUntil } = gasSession('minor');
    playUntil('retreat');
    session.skip();
    playUntil();
    const e = evaluate(GAS, 'minor', session.events);
    expect(e.rules.find((r) => r.ruleId === 'R_RETREAT_TIME')).toEqual(expect.objectContaining({ earned: 0, passed: false }));
    expect(e.scorePercent).toBe(94); // 80 / 85: minor leaves out the 15 self-rescuer points
    expect(e.passed).toBe(true);
  });

  test('skipping the ignition question fails R_NO_IGNITION critically instead of earning "no forbidden act"', () => {
    const { session, playUntil } = gasSession('minor');
    playUntil('ignition_trap');
    session.skip();
    playUntil();
    const e = evaluate(GAS, 'minor', session.events);
    expect(rule(session.events, 'minor', 'R_NO_IGNITION')).toEqual(expect.objectContaining({ earned: 0, passed: false }));
    expect(e.criticalFailures).toContain('R_NO_IGNITION');
    expect(e.passed).toBe(false);
  });

  test('skipping a step voids order rules on it (major: rescuer before retreat)', () => {
    const { session, playUntil } = gasSession('major');
    playUntil('retreat');
    session.skip();
    playUntil();
    expect(rule(session.events, 'major', 'R_ORDER_RESCUER_RETREAT')).toEqual(expect.objectContaining({ earned: 0, passed: false }));
  });

  test('points recorded before the skip do not count: a half-done hold earns nothing', () => {
    const { session, tick } = clockedSession('ordinary');
    session.start();
    session.complete(); // brief
    session.complete({ headingDeg: 10, elevationDeg: -30 }); // place_fire
    session.record('target_hit', { target: 'AlarmCallPoint' });
    session.complete(); // raise_alarm
    session.record('marker_found', { marker: 'EXIT_A' });
    session.complete(); // find_exit
    session.choose('water');
    session.arrive('AttackSpot', 0, { exitBehind: true });
    spray(session, tick, 24); // 6 s sweeping the base: enough for R_AIM_BASE on its own
    session.skip(); // extinguish
    const e = evaluate(FIRE, 'ordinary', session.events);
    expect(rule(session.events, 'ordinary', 'R_AIM_BASE', FIRE)).toEqual(expect.objectContaining({ earned: 0, passed: false }));
    // "alarm before fight" can't be earned for a fight that was skipped; it is critical
    expect(e.criticalFailures).toContain('R_ALARM_BEFORE_FIGHT');
    expect(e.passed).toBe(false);
  });

  test('a variant step_skipped is not a worker skip (GAS_01 minor self_rescuer)', () => {
    const e = evaluate(GAS, 'minor', gasSession('minor').playUntil().events);
    expect(e.scorePercent).toBe(100);
    expect(e.passed).toBe(true);
  });
});
