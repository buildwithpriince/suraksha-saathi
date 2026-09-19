/**
 * docs/03 assessment engine: a pure function of (scenario, variant, events). No clocks, no
 * randomness, no platform APIs. Earned points are integers ("half" = floor(points / 2)) and
 * scorePercent is computed in integers, rounding half away from zero (D-022, D-028).
 */
import type { JsonValue, Rule, Scenario, Step } from '../scenarios/types';
import { MULTI_SELECT } from '../scenarios/types';
import { findVariant, resolveParams, stepOptions, stepRunsIn } from '../scenarios/variants';
import type { AttemptEvent, Evaluation, RuleResult } from './types';

// Event times carry 2 decimals; compare with a tolerance so 0.1 + 0.2 style noise can't flip a rule.
const EPSILON = 1e-9;

export function evaluate(scenario: Scenario, variantId: string, events: readonly AttemptEvent[]): Evaluation {
  const variant = findVariant(scenario, variantId);
  const log = new EventLog(sortByTime(events));
  const steps = new Map(scenario.steps.map((s) => [s.id, s]));
  const skippedByWorker = workerSkippedSteps(steps, variant.id, log);

  const rules: RuleResult[] = [];
  const criticalFailures: string[] = [];
  let earnedTotal = 0;
  let maxTotal = 0;
  for (const rule of scenario.rules) {
    // Variant-scoped rules are skipped for other variants: out of both earned and max
    if (rule.variants !== undefined && !rule.variants.includes(variant.id)) continue;
    // D-033: a step the worker skipped scores as failed, whatever was recorded in it before the skip
    const failedStep = scoresSkippedStep(rule, skippedByWorker, steps);
    const earned = failedStep ? 0 : earnedPoints(rule, variant.id, steps, log, (step) => resolveParams(step.params, variant));
    const criticalFailure = rule.critical && (failedStep || isCriticalFailure(rule, earned, log));
    if (criticalFailure) criticalFailures.push(rule.id);
    rules.push({
      ruleId: rule.id,
      earned,
      max: rule.points,
      critical: rule.critical,
      passed: rule.critical ? !criticalFailure : earned === rule.points,
      feedbackKey: rule.feedbackKey,
    });
    earnedTotal += earned;
    maxTotal += rule.points;
  }

  const scorePercent = roundPercent(earnedTotal, maxTotal);
  const aborted = log.all.some((e) => e.type === 'attempt_aborted');
  const passed = criticalFailures.length === 0 && !aborted && scorePercent >= scenario.passThresholdPercent;
  return { scorePercent, passed, criticalFailures, rules };
}

/** round(100 × earned / max), half away from zero, in integer math (D-022). 0 when max is 0. */
export function roundPercent(earned: number, max: number): number {
  if (max <= 0) return 0;
  return Math.floor((200 * earned + max) / (2 * max));
}

/** docs/03 test 11: sort by `t`, stable, before evaluating. */
export function sortByTime(events: readonly AttemptEvent[]): AttemptEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.t - b.event.t || a.index - b.index)
    .map((x) => x.event);
}

/**
 * Steps the worker skipped with "Skip step" (D-033): a `step_skipped` for a step that runs in this
 * variant. Steps outside the variant are `step_skipped` too, but their rules are variant-scoped.
 */
function workerSkippedSteps(steps: Map<string, Step>, variantId: string, log: EventLog): Set<string> {
  const skipped = new Set<string>();
  for (const e of log.all) {
    const step = e.type === 'step_skipped' && e.stepId !== undefined ? steps.get(e.stepId) : undefined;
    if (step !== undefined && stepRunsIn(step, variantId)) skipped.add(step.id);
  }
  return skipped;
}

/**
 * A rule scores a skipped step if it names it (`step`, `before`, `after`) or, for `no_forbidden`,
 * if its tag belongs to one of the step's options: skipping the question must not earn "no forbidden act".
 */
function scoresSkippedStep(rule: Rule, skipped: ReadonlySet<string>, steps: Map<string, Step>): boolean {
  if (skipped.size === 0) return false;
  const p = rule.params;
  if ([p.step, p.before, p.after].some((s) => typeof s === 'string' && skipped.has(s))) return true;
  if (rule.type !== 'no_forbidden') return false;
  return [...skipped].some((id) => stepOptions(steps.get(id)!).some((o) => o.tag === p.tag));
}

/**
 * docs/03 "Critical rules": a critical rule fails if any forbidden_action occurred in its step
 * (params.step), and also if it earned 0 unless it has criticalOn: "forbidden" (D-017).
 */
function isCriticalFailure(rule: Rule, earned: number, log: EventLog): boolean {
  const step = typeof rule.params.step === 'string' ? rule.params.step : null;
  const forbiddenInStep = step !== null && log.inStep(step, 'forbidden_action').length > 0;
  if (rule.criticalOn === 'forbidden') return forbiddenInStep;
  return earned === 0 || forbiddenInStep;
}

function earnedPoints(
  rule: Rule,
  variantId: string,
  steps: Map<string, Step>,
  log: EventLog,
  resolvedParams: (step: Step) => { [key: string]: JsonValue },
): number {
  const p = rule.params;
  const full = rule.points;
  const half = Math.floor(rule.points / 2);
  switch (rule.type) {
    case 'completed': {
      const where = (p.where ?? {}) as { [key: string]: JsonValue };
      const done = log.inStep(p.step as string, 'step_completed').some((e) =>
        Object.entries(where).every(([k, v]) => e.data?.[k] === v),
      );
      return done ? full : 0;
    }
    case 'order': {
      const before = log.first(p.before as string, 'step_completed');
      const afterStarted = log.first(p.after as string, 'step_started');
      return before !== undefined && afterStarted !== undefined && before.t < afterStarted.t ? full : 0;
    }
    case 'time_limit': {
      const started = log.first(p.step as string, 'step_started');
      const completed = log.first(p.step as string, 'step_completed');
      if (started === undefined || completed === undefined) return 0;
      return completed.t - started.t <= (p.seconds as number) + EPSILON ? full : 0;
    }
    case 'correct_choice':
      return correctChoicePoints(rule, variantId, steps.get(p.step as string)!, log);
    case 'no_forbidden':
      return log.all.some((e) => e.type === 'forbidden_action' && e.data?.tag === p.tag) ? 0 : full;
    case 'hold': {
      const step = steps.get(p.step as string)!;
      const offTargetZones = (resolvedParams(step).offTargetZones ?? []) as string[];
      // D-028: each hold_progress is one 0.25 s sample; onTargetSec is cumulative
      const samples = log.inStep(step.id, 'hold_progress');
      const onTarget = Math.max(0, ...samples.map((e) => Number(e.data?.onTargetSec ?? 0)));
      const offSamples = samples.filter((e) => offTargetZones.includes(String(e.data?.zone))).length;
      const offRatio = samples.length === 0 ? 1 : offSamples / samples.length;
      const onMet = onTarget + EPSILON >= (p.minOnTargetSec as number);
      const offMet = offRatio <= (p.maxOffTargetRatio as number) + EPSILON;
      if (onMet && offMet) return full;
      return onMet ? half : 0;
    }
    case 'zone_accuracy': {
      const step = steps.get(p.step as string)!;
      const trueRadius = resolvedParams(step).trueRadiusM as number;
      const marked = log.first(step.id, 'zone_marked')?.data?.radiusM;
      if (typeof marked !== 'number') return 0;
      const error = Math.abs(marked - trueRadius);
      const tolerance = p.toleranceM as number;
      if (error <= tolerance + EPSILON) return full;
      return error <= 2 * tolerance + EPSILON ? half : 0;
    }
  }
}

function correctChoicePoints(rule: Rule, variantId: string, step: Step, log: EventLog): number {
  const raw = rule.params.correct;
  const correct = (Array.isArray(raw) ? raw : (raw as { [v: string]: JsonValue })[variantId]) as string[];
  const choice = log.first(step.id, 'choice_made');
  if (choice === undefined) return 0;

  if (!MULTI_SELECT.includes(step.interaction)) {
    // Single choice: full only if the first choice is correct
    return correct.includes(String(choice.data?.option)) ? rule.points : 0;
  }
  const picked = new Set(Array.isArray(choice.data?.options) ? (choice.data.options as JsonValue[]).map(String) : []);
  const right = [...picked].filter((o) => correct.includes(o)).length;
  const wrong = picked.size - right;
  if (rule.params.partial === true) {
    return Math.floor((rule.points * Math.max(0, right - wrong)) / correct.length);
  }
  // D-017: without partial, full only for exactly the correct set
  return wrong === 0 && right === new Set(correct).size ? rule.points : 0;
}

class EventLog {
  constructor(readonly all: AttemptEvent[]) {}

  inStep(stepId: string, type: AttemptEvent['type']): AttemptEvent[] {
    return this.all.filter((e) => e.stepId === stepId && e.type === type);
  }

  first(stepId: string, type: AttemptEvent['type']): AttemptEvent | undefined {
    return this.all.find((e) => e.stepId === stepId && e.type === type);
  }
}
