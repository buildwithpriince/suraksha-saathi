import fireJson from '@content/scenarios/FIRE_01.json';
import gasJson from '@content/scenarios/GAS_01.json';
import { describe, expect, test } from 'vitest';

import { evaluate } from '../assessment/engine';
import { loadScenario } from '../scenarios/load';
import { PREFABS } from './prefabs';
import { ScenarioSession } from './session';
import { markedRadiusM } from './zone';

const FIRE = loadScenario(fireJson);
const GAS = loadScenario(gasJson);

function clockedSession(scenarioVariant: 'ordinary' | 'oil') {
  let now = 0;
  const session = new ScenarioSession(FIRE, scenarioVariant, () => now);
  return { session, tick: (sec: number) => (now += sec) };
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
  for (let i = 0; i < 40; i++) {
    tick(0.25);
    session.holdSample('FireBase');
  }
  tick(3);
  session.choose('evacuate_alert');
  tick(30);
  session.record('position_reached', { anchor: 'EXIT_A', distanceM: null });
  session.complete();
  tick(4);
  session.choose('report_headcount');
  return session;
}

/** Plays GAS_01 the way the camera screen does, with cones tapped `coneDeg` degrees from the leak. */
function playGas(variant: 'minor' | 'major', coneDeg: number, ppe = ['self_rescuer', 'gas_detector', 'helmet_cap_lamp']) {
  let now = 0;
  const tick = (sec: number) => (now += sec);
  const session = new ScenarioSession(GAS, variant, () => now);
  const area = PREFABS.ConfinedAreaEntrance!;
  const leak = area.objects.LeakSource!;
  session.start();
  tick(5);
  session.complete(); // brief
  tick(3);
  session.complete({ headingDeg: 40, elevationDeg: -35 }); // place_area
  tick(8);
  session.chooseMany(ppe);
  tick(10);
  session.chooseMany(['detector_on', 'self_rescuer_carried', 'lamp_working', 'hand_signals_agreed']);
  tick(12);
  session.record('position_reached', { anchor: 'LeakSource', distanceM: 0 });
  session.complete(); // detect
  tick(15);
  const cones = [0, 90, 180, 270].map((deg) => ({
    dh: leak.dh + coneDeg * Math.cos((deg * Math.PI) / 180),
    de: leak.de + coneDeg * Math.sin((deg * Math.PI) / 180),
  }));
  session.record('zone_marked', { radiusM: markedRadiusM(area, 'LeakSource', cones) });
  session.complete(); // mark_zone
  tick(4);
  session.choose('do_not_touch');
  if (variant === 'major') {
    tick(4);
    session.choose('don_now');
  }
  tick(4);
  session.choose('retreat_signal');
  tick(20);
  session.record('position_reached', { anchor: 'FreshAirPoint', distanceM: 0 });
  session.complete(); // retreat
  tick(4);
  session.choose('report_barricade');
  return session;
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

  test('the hold completes after durationSec of samples with cumulative onTargetSec', () => {
    const session = playFire('ordinary', 'water');
    const holds = session.events.filter((e) => e.type === 'hold_progress');
    expect(holds).toHaveLength(40); // durationSec 10 / 0.25
    expect(holds.at(-1)?.data?.onTargetSec).toBe(10);
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
