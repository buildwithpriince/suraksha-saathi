/**
 * ScenarioPlayer core (T-22): walks any scenario's steps and records the docs/03 event log.
 * Screens call the interaction methods; nothing here knows about a specific module (D-003).
 * The clock is injected (seconds since attempt start, monotonic) so tests control time.
 */
import type { AttemptEvent, EventType } from '../assessment/types';
import type { JsonObject, JsonValue, Scenario, Step } from '../scenarios/types';
import { MULTI_SELECT } from '../scenarios/types';
import { findVariant, optionForbiddenIn, resolveParams, stepOptions, stepRunsIn } from '../scenarios/variants';

/** Seconds per `hold_progress` sample (docs/02, D-028). */
export const HOLD_SAMPLE_SEC = 0.25;

/** "Skip step" is offered after this long without progress in a step (D-033). */
export const SKIP_OFFER_AFTER_SEC = 30;

export interface CurrentStep {
  index: number;
  step: Step;
  /** Params after `"$name"` variant substitution. */
  params: JsonObject;
}

export class ScenarioSession {
  readonly events: AttemptEvent[] = [];
  private index = -1;
  private done = false;
  private heldSamples = 0;
  private onTargetSec = 0;
  private pinPulled = false;
  private discharging = false;

  constructor(
    readonly scenario: Scenario,
    readonly variantId: string,
    private readonly clock: () => number,
  ) {
    findVariant(scenario, variantId); // throws on an unknown variant
  }

  get finished(): boolean {
    return this.done;
  }

  /** Begin the first step that runs in this variant. */
  start(): void {
    if (this.index !== -1) throw new Error('session already started');
    this.advance();
  }

  current(): CurrentStep | null {
    if (this.done || this.index < 0) return null;
    const step = this.scenario.steps[this.index]!;
    return { index: this.index, step, params: resolveParams(step.params, findVariant(this.scenario, this.variantId)) };
  }

  /** `step_completed` for the current step, then the next step. */
  complete(data?: JsonObject): void {
    const cur = this.require();
    this.emit('step_completed', cur.step.id, data);
    this.advance();
  }

  /** `choose_one` / `decision`: records the choice, any forbidden action, and completes the step. */
  choose(optionId: string): void {
    const cur = this.require();
    if (MULTI_SELECT.includes(cur.step.interaction)) throw new Error(`${cur.step.id} takes several options`);
    this.emit('choice_made', cur.step.id, { option: optionId });
    this.emitForbidden(cur.step, [optionId]);
    this.complete();
  }

  /** `choose_many` / `checklist`. */
  chooseMany(optionIds: string[]): void {
    const cur = this.require();
    if (!MULTI_SELECT.includes(cur.step.interaction)) throw new Error(`${cur.step.id} takes one option`);
    this.emit('choice_made', cur.step.id, { options: optionIds });
    this.emitForbidden(cur.step, optionIds);
    this.complete();
  }

  /**
   * `move_to` arrival: `position_reached{anchor, distanceM}`, then `step_completed` with `data`
   * (e.g. `exitBehind`). `distanceM` is null when reaching means scanning a marker (D-027).
   */
  arrive(anchor: string, distanceM: number | null, data?: JsonObject): void {
    const cur = this.require();
    if (cur.step.interaction !== 'move_to') throw new Error(`${cur.step.id} is not move_to`);
    this.emit('position_reached', cur.step.id, { anchor, distanceM });
    this.complete(data);
  }

  /** Record an interaction event in the current step without completing it. */
  record(type: Extract<EventType, 'target_hit' | 'marker_found' | 'position_reached' | 'zone_marked'>, data: JsonObject): void {
    this.emit(type, this.require().step.id, data);
  }

  /**
   * One 0.25 s `aim_and_hold` sample with the zone under the reticle ("none" if none).
   * Completes the step once the hold phase (`durationSec`) is over. Returns seconds held so far.
   */
  holdSample(zone: string): number {
    const cur = this.require();
    if (cur.step.interaction !== 'aim_and_hold') throw new Error(`${cur.step.id} is not aim_and_hold`);
    this.heldSamples += 1;
    if (zone === cur.params.targetZone) this.onTargetSec = round2(this.onTargetSec + HOLD_SAMPLE_SEC);
    this.emit('hold_progress', cur.step.id, { zone, onTargetSec: this.onTargetSec });
    const heldSec = this.heldSamples * HOLD_SAMPLE_SEC;
    if (heldSec + 1e-9 >= (cur.params.durationSec as number)) this.complete();
    return heldSec;
  }

  /**
   * `operate_extinguisher` PASS "Pull": `pin_pulled{method}`, once per step. `method` is how:
   * swiped off the handle, or the "Tap to pull the pin" fallback offered after 8 s.
   */
  pullPin(method: 'swipe' | 'tap' = 'swipe'): void {
    const cur = this.requireExtinguisher();
    if (this.pinPulled) return;
    this.pinPulled = true;
    this.emit('pin_pulled', cur.step.id, { method });
  }

  /** `operate_extinguisher` "Squeeze" lever pressed; ignored until the pin is out (the lever is locked). */
  startDischarge(): boolean {
    const cur = this.requireExtinguisher();
    if (!this.pinPulled || this.discharging) return false;
    this.discharging = true;
    this.emit('discharge_started', cur.step.id);
    return true;
  }

  /** Lever released. */
  stopDischarge(): void {
    const cur = this.requireExtinguisher();
    if (!this.discharging) return;
    this.discharging = false;
    this.emit('discharge_stopped', cur.step.id);
  }

  get isDischarging(): boolean {
    return this.discharging;
  }

  /**
   * One 0.25 s sample while discharging: `hold_progress{zone, onTargetSec, aimDh}`, the same
   * sample the `hold` rule scores, plus the horizontal aim it counts sweeps from (D-038).
   * Returns seconds on target so far.
   */
  spraySample(zone: string, aimDh: number): number {
    const cur = this.requireExtinguisher();
    if (!this.discharging) throw new Error('not discharging');
    if (zone === cur.params.targetZone) this.onTargetSec = round2(this.onTargetSec + HOLD_SAMPLE_SEC);
    this.emit('hold_progress', cur.step.id, { zone, onTargetSec: this.onTargetSec, aimDh: round1(aimDh) });
    return this.onTargetSec;
  }

  /** The fire is out, out of control, the extinguisher is empty, or it was the wrong one: next step. */
  finishExtinguisher(outcome: string, extinguished: boolean): void {
    this.requireExtinguisher();
    this.stopDischarge();
    this.complete({ extinguished, outcome });
  }

  /**
   * The worker re-placed the overlay because it drifted (D-036): `anchor_repositioned` with the
   * new anchor direction, in the current step. Neutral: it neither completes the step nor scores.
   */
  reposition(headingDeg: number, elevationDeg: number): void {
    this.emit('anchor_repositioned', this.require().step.id, { headingDeg: round1(headingDeg), elevationDeg: round1(elevationDeg) });
  }

  /**
   * The worker couldn't complete the current step ("Skip step", D-033): `step_skipped` with
   * `reason: "no_progress"`, then the next step. The engine scores the step as failed.
   */
  skip(): void {
    const cur = this.require();
    if (this.discharging) this.stopDischarge(); // close the lever press in the log
    this.emit('step_skipped', cur.step.id, { reason: 'no_progress' });
    this.advance();
  }

  /** The worker stopped: `attempt_aborted`; the attempt still gets scored for feedback. */
  abort(): void {
    if (this.done) return;
    if (this.discharging) this.stopDischarge();
    this.emit('attempt_aborted', this.current()?.step.id);
    this.done = true;
  }

  /** Seconds since the attempt started, as recorded in events. */
  now(): number {
    return round2(this.clock());
  }

  private advance(): void {
    this.heldSamples = 0;
    this.onTargetSec = 0;
    this.pinPulled = false;
    this.discharging = false;
    for (this.index += 1; this.index < this.scenario.steps.length; this.index += 1) {
      const step = this.scenario.steps[this.index]!;
      if (stepRunsIn(step, this.variantId)) {
        this.emit('step_started', step.id);
        return;
      }
      this.emit('step_skipped', step.id);
    }
    this.done = true;
  }

  private emitForbidden(step: Step, picked: string[]): void {
    for (const option of stepOptions(step)) {
      if (picked.includes(option.id) && optionForbiddenIn(option, this.variantId)) {
        this.emit('forbidden_action', step.id, { tag: option.tag as JsonValue });
      }
    }
  }

  private emit(type: EventType, stepId?: string, data?: JsonObject): void {
    const event: AttemptEvent = { t: this.now(), type };
    if (stepId !== undefined) event.stepId = stepId;
    if (data !== undefined) event.data = data;
    this.events.push(event);
  }

  private requireExtinguisher(): CurrentStep {
    const cur = this.require();
    if (cur.step.interaction !== 'operate_extinguisher') throw new Error(`${cur.step.id} is not operate_extinguisher`);
    return cur;
  }

  private require(): CurrentStep {
    const cur = this.current();
    if (cur === null) throw new Error('no current step');
    return cur;
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
