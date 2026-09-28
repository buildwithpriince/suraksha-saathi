/**
 * `operate_extinguisher` (D-038): the fire the worker fights with the PASS technique, as a pure
 * step function the screen calls every `HOLD_SAMPLE_SEC`. Presentation only: scoring reads the
 * event log (`pin_pulled`, `hold_progress{zone, onTargetSec, aimDh}`), never this state.
 *
 * Rates are gameplay tuning, not safety content (tune on device). The only safety fact used is
 * whether the chosen extinguisher suits the fire, and that comes from the scenario: an option that
 * is `forbidden` in this variant (FIRE_01: water on an oil fire) has no effect.
 */
import type { AttemptEvent } from '../assessment/types';
import { sweepReversals } from '../assessment/sweeps';
import type { Scenario } from '../scenarios/types';
import { optionForbiddenIn, stepOptions } from '../scenarios/variants';

/** Fire size at the start of the step (1 = as placed). */
export const FIRE_START = 1;
/** At or below this the fire is out. */
export const FIRE_OUT = 0.08;
/** At or above this the fire is out of control (the size FIRE_01's escalation shows). */
export const FIRE_MAX = 1.9;
/** Per sample (0.25 s) of spray on the base with a static aim: about 10 s for a fresh fire. */
export const KNOCKDOWN_STATIC = 0.025;
/** Per sample while sweeping across the base: twice as fast, about 5 s. */
export const KNOCKDOWN_SWEEP = 0.05;
/** Per sample while the fire is not being put out (idle, flame tops, off target). */
export const GROWTH = 0.006;
/** Per sample of spray from an extinguisher that does not suit this fire. */
export const FLARE = 0.03;
/** Samples of wrong-agent spray before the failure is shown (1 s). */
export const WRONG_AGENT_SAMPLES = 4;
/** Recent on-base samples in which a reversal means "sweeping now" (2 s). */
export const SWEEP_WINDOW = 8;

export type ExtinguisherOutcome = 'extinguished' | 'out_of_control' | 'empty' | 'wrong_agent';

export interface ExtinguisherConfig {
  targetZone: string;
  offTargetZones: readonly string[];
  /** Seconds of discharge the extinguisher holds. */
  dischargeSec: number;
  /** false when the extinguisher chosen earlier is forbidden for this fire. */
  agentEffective: boolean;
}

export interface ExtinguisherState {
  fire: number;
  dischargedSec: number;
  /** aimDh of recent samples spent spraying the base, for "sweeping now". */
  recentBase: number[];
  sweeping: boolean;
  /** Where the spray is landing: the target zone, an off-target zone, or "none"; null when not spraying. */
  sprayZone: string | null;
  wrongAgentSamples: number;
  outcome: ExtinguisherOutcome | null;
}

export const INITIAL_EXTINGUISHER: ExtinguisherState = {
  fire: FIRE_START,
  dischargedSec: 0,
  recentBase: [],
  sweeping: false,
  sprayZone: null,
  wrongAgentSamples: 0,
  outcome: null,
};

export interface ExtinguisherSample {
  /** Lever held down with the pin out. */
  discharging: boolean;
  /** Zone under the nozzle's aim ("none" if none). */
  zone: string;
  /** Horizontal aim relative to the fire, prefab degrees. */
  aimDh: number;
}

/** One `HOLD_SAMPLE_SEC` tick. Once there is an outcome the state no longer changes. */
export function extinguisherTick(s: ExtinguisherState, sample: ExtinguisherSample, cfg: ExtinguisherConfig, sampleSec: number): ExtinguisherState {
  if (s.outcome !== null) return s;
  let { fire, dischargedSec, recentBase, wrongAgentSamples } = s;
  let sweeping = false;
  if (!sample.discharging) {
    fire += GROWTH;
  } else {
    dischargedSec += sampleSec;
    if (!cfg.agentEffective) {
      fire += FLARE;
      wrongAgentSamples += 1;
    } else if (sample.zone === cfg.targetZone) {
      recentBase = [...recentBase, sample.aimDh].slice(-SWEEP_WINDOW);
      sweeping = sweepReversals(recentBase) > 0;
      fire -= sweeping ? KNOCKDOWN_SWEEP : KNOCKDOWN_STATIC;
    } else {
      fire += GROWTH; // flame tops or beside the fire: nothing reaches the fuel
    }
  }
  fire = Math.min(FIRE_MAX, Math.max(0, fire));
  let outcome: ExtinguisherOutcome | null = null;
  if (wrongAgentSamples >= WRONG_AGENT_SAMPLES) outcome = 'wrong_agent';
  else if (fire <= FIRE_OUT) outcome = 'extinguished';
  else if (fire >= FIRE_MAX) outcome = 'out_of_control';
  else if (dischargedSec + 1e-9 >= cfg.dischargeSec) outcome = 'empty';
  return {
    fire: outcome === 'extinguished' ? 0 : fire,
    dischargedSec,
    recentBase,
    sweeping,
    sprayZone: sample.discharging ? sample.zone : null,
    wrongAgentSamples,
    outcome,
  };
}

/**
 * Whether the extinguisher chosen in step `agentFrom` suits the fire in this variant: false only if
 * the chosen option is `forbidden` here. No choice recorded (the step was skipped): true.
 */
export function agentEffective(scenario: Scenario, variantId: string, events: readonly AttemptEvent[], agentFrom: string): boolean {
  const step = scenario.steps.find((s) => s.id === agentFrom);
  const choice = events.find((e) => e.type === 'choice_made' && e.stepId === agentFrom);
  if (step === undefined || choice === undefined) return true;
  const option = stepOptions(step).find((o) => o.id === choice.data?.option);
  return option === undefined || !optionForbiddenIn(option, variantId);
}
