/**
 * Scenario JSON loader and validator (docs/02 contract, D-016, D-017; T-10). The backend's
 * validate_scenarios.py (T-16) runs the same checks. A scenario that fails any check is never
 * played: loadScenario throws ScenarioError listing every problem.
 */
import {
  INTERACTION_TYPES,
  MULTI_SELECT,
  RULE_TYPES,
  WITH_OPTIONS,
  type InteractionType,
  type JsonObject,
  type JsonValue,
  type Scenario,
  type Step,
  type Variant,
} from './types';
import { referenceName, resolveParams, stepOptions } from './variants';

export class ScenarioError extends Error {
  constructor(readonly problems: string[]) {
    super(`invalid scenario: ${problems.join('; ')}`);
  }
}

const TOTAL_POINTS = 100;

type Obj = { [key: string]: unknown };

class Checker {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  object(value: unknown, path: string): Obj | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Obj;
    this.fail(path, 'must be an object');
    return null;
  }

  string(o: Obj, key: string, path: string): string {
    const v = o[key];
    if (typeof v === 'string' && v !== '') return v;
    this.fail(`${path}.${key}`, 'must be a non-empty string');
    return '';
  }

  number(o: Obj, key: string, path: string, { min, max, integer = false }: { min?: number; max?: number; integer?: boolean } = {}): number {
    const v = o[key];
    const ok =
      typeof v === 'number' &&
      Number.isFinite(v) &&
      (!integer || Number.isSafeInteger(v)) &&
      (min === undefined || v >= min) &&
      (max === undefined || v <= max);
    if (ok) return v;
    const range = `${min ?? '-inf'}..${max ?? 'inf'}`;
    this.fail(`${path}.${key}`, `must be ${integer ? 'an integer' : 'a number'} in ${range}`);
    return NaN;
  }

  bool(o: Obj, key: string, path: string, optional = false): boolean | undefined {
    const v = o[key];
    if (typeof v === 'boolean') return v;
    if (optional && v === undefined) return undefined;
    this.fail(`${path}.${key}`, 'must be true or false');
    return undefined;
  }

  strings(o: Obj, key: string, path: string, optional = false): string[] | undefined {
    const v = o[key];
    if (optional && v === undefined) return undefined;
    if (Array.isArray(v) && v.every((s) => typeof s === 'string' && s !== '')) return v as string[];
    this.fail(`${path}.${key}`, 'must be a list of non-empty strings');
    return undefined;
  }

  unique(ids: string[], path: string): void {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) this.fail(path, `duplicate id ${id}`);
      seen.add(id);
    }
  }

  subset(values: string[] | undefined, allowed: Set<string>, path: string, what: string): void {
    for (const v of values ?? []) if (!allowed.has(v)) this.fail(path, `unknown ${what} ${v}`);
  }
}

export function loadScenario(json: unknown): Scenario {
  const c = new Checker();
  const root = c.object(json, 'scenario');
  if (root === null) throw new ScenarioError(c.problems);

  const id = c.string(root, 'id', 'scenario');
  if (id !== '' && !/^[A-Z][A-Z0-9_]*$/.test(id)) c.fail('scenario.id', 'must be upper-case letters, digits and _');
  c.number(root, 'version', 'scenario', { min: 1, integer: true });
  c.string(root, 'domain', 'scenario');
  c.string(root, 'titleKey', 'scenario');
  c.bool(root, 'needsReview', 'scenario');
  c.number(root, 'passThresholdPercent', 'scenario', { min: 0, max: 100, integer: true });
  c.number(root, 'validityDays', 'scenario', { min: 1, integer: true });
  c.number(root, 'timeLimitSec', 'scenario', { min: 1 });

  const setup = c.object(root.setup, 'scenario.setup');
  if (setup !== null) c.bool(setup, 'requiresPlane', 'scenario.setup');
  const markers = new Set(setup === null ? [] : (c.strings(setup, 'markers', 'scenario.setup') ?? []));

  const variants = checkVariants(c, root.variants);
  const variantIds = new Set(variants.map((v) => v.id));
  const steps = checkSteps(c, root.steps, variants, variantIds, markers);
  checkRules(c, root.rules, steps, variantIds);

  if (c.problems.length > 0) throw new ScenarioError(c.problems);
  return json as Scenario;
}

function checkVariants(c: Checker, value: unknown): Variant[] {
  if (!Array.isArray(value) || value.length === 0) {
    c.fail('scenario.variants', 'must be a non-empty list');
    return [];
  }
  const variants: Variant[] = [];
  value.forEach((raw, i) => {
    const path = `variants[${i}]`;
    const v = c.object(raw, path);
    if (v === null) return;
    const id = c.string(v, 'id', path);
    const params = c.object(v.params, `${path}.params`);
    c.bool(v, 'needsReview', path, true);
    if (params !== null) variants.push({ id, params: params as JsonObject });
  });
  c.unique(
    variants.map((v) => v.id),
    'scenario.variants',
  );
  return variants;
}

function checkSteps(c: Checker, value: unknown, variants: Variant[], variantIds: Set<string>, markers: Set<string>): Map<string, Step> {
  const steps = new Map<string, Step>();
  if (!Array.isArray(value) || value.length === 0) {
    c.fail('scenario.steps', 'must be a non-empty list');
    return steps;
  }
  value.forEach((raw, i) => {
    const s = c.object(raw, `steps[${i}]`);
    if (s === null) return;
    const id = c.string(s, 'id', `steps[${i}]`);
    const path = `steps[${id || i}]`;
    if (steps.has(id)) c.fail(path, 'duplicate step id');
    const interaction = s.interaction as InteractionType;
    if (!INTERACTION_TYPES.includes(interaction)) c.fail(`${path}.interaction`, `unknown interaction ${String(s.interaction)}`);
    c.string(s, 'instructionKey', path);
    c.string(s, 'audioKey', path);
    const params = c.object(s.params, `${path}.params`);
    if (s.timeLimitSec !== undefined) c.number(s, 'timeLimitSec', path, { min: 1 });
    const runsIn = c.strings(s, 'variants', path, true);
    c.subset(runsIn, variantIds, `${path}.variants`, 'variant');
    c.bool(s, 'needsReview', path, true);
    if (params === null || !INTERACTION_TYPES.includes(interaction)) return;

    const step: Step = s as unknown as Step;
    steps.set(id, step);
    for (const variant of variants) {
      if (runsIn !== undefined && !runsIn.includes(variant.id)) continue;
      let resolved: JsonObject;
      try {
        checkReferences(c, params as JsonObject, variant, `${path}.params`);
        resolved = resolveParams(params as JsonObject, variant);
      } catch {
        continue; // checkReferences already reported the missing variant param
      }
      checkParams(c, interaction, resolved, `${path}.params (variant ${variant.id})`, markers, variantIds);
    }
  });
  return steps;
}

function checkReferences(c: Checker, value: JsonValue, variant: Variant, path: string): void {
  if (typeof value === 'string') {
    const name = referenceName(value);
    if (name !== null && variant.params[name] === undefined) c.fail(path, `variant ${variant.id} has no param ${name}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => checkReferences(c, v, variant, `${path}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) checkReferences(c, v, variant, `${path}.${k}`);
  }
}

/** docs/02 "Params by interaction type". */
function checkParams(c: Checker, type: InteractionType, p: Obj, path: string, markers: Set<string>, variantIds: Set<string>): void {
  switch (type) {
    case 'narration':
      return;
    case 'place_on_plane':
      c.string(p, 'prefab', path);
      return;
    case 'tap_target':
      c.string(p, 'target', path);
      return;
    case 'choose_one':
    case 'choose_many':
    case 'checklist':
    case 'decision':
      checkOptions(c, p.options, `${path}.options`, variantIds);
      return;
    case 'aim_and_hold':
      c.string(p, 'targetZone', path);
      c.strings(p, 'offTargetZones', path);
      c.number(p, 'durationSec', path, { min: 0.25 });
      return;
    case 'find_marker': {
      const marker = c.string(p, 'marker', path);
      if (marker !== '' && !markers.has(marker)) c.fail(`${path}.marker`, `${marker} is not in setup.markers`);
      return;
    }
    case 'move_to': {
      c.string(p, 'anchor', path);
      c.number(p, 'radiusM', path, { min: 0.1 });
      c.bool(p, 'showRoute', path, true);
      if (p.exitBehind !== undefined) {
        const e = c.object(p.exitBehind, `${path}.exitBehind`);
        if (e !== null) {
          const marker = c.string(e, 'marker', `${path}.exitBehind`);
          if (marker !== '' && !markers.has(marker)) c.fail(`${path}.exitBehind.marker`, `${marker} is not in setup.markers`);
          c.number(e, 'minAngleDeg', `${path}.exitBehind`, { min: 0, max: 180 });
        }
      }
      if (p.detector !== undefined) {
        const d = c.object(p.detector, `${path}.detector`);
        if (d !== null) {
          for (const key of ['peakReading', 'alertLevel', 'dangerLevel']) c.number(d, key, `${path}.detector`, { min: 0 });
        }
      }
      return;
    }
    case 'mark_zone':
      c.string(p, 'hazard', path);
      c.number(p, 'trueRadiusM', path, { min: 0.1 });
      c.number(p, 'minCones', path, { min: 1, integer: true });
      return;
  }
}

function checkOptions(c: Checker, value: unknown, path: string, variantIds: Set<string>): void {
  if (!Array.isArray(value) || value.length === 0) {
    c.fail(path, 'must be a non-empty list');
    return;
  }
  const ids: string[] = [];
  value.forEach((raw, i) => {
    const o = c.object(raw, `${path}[${i}]`);
    if (o === null) return;
    const id = c.string(o, 'id', `${path}[${i}]`);
    ids.push(id);
    const p = `${path}[${id || i}]`;
    c.string(o, 'labelKey', p);
    const forbidden = c.bool(o, 'forbidden', p, true);
    if (forbidden === true) c.string(o, 'tag', p);
    else if (o.tag !== undefined || o.forbiddenVariants !== undefined) c.fail(p, 'tag and forbiddenVariants need forbidden: true');
    c.subset(c.strings(o, 'forbiddenVariants', p, true), variantIds, `${p}.forbiddenVariants`, 'variant');
    c.bool(o, 'needsReview', p, true);
  });
  c.unique(ids, path);
}

function checkRules(c: Checker, value: unknown, steps: Map<string, Step>, variantIds: Set<string>): void {
  if (!Array.isArray(value) || value.length === 0) {
    c.fail('scenario.rules', 'must be a non-empty list');
    return;
  }
  const forbiddenTags = new Set<string>();
  for (const step of steps.values()) for (const o of stepOptions(step)) if (o.forbidden === true && o.tag) forbiddenTags.add(o.tag);

  const ids: string[] = [];
  let total = 0;
  value.forEach((raw, i) => {
    const r = c.object(raw, `rules[${i}]`);
    if (r === null) return;
    const id = c.string(r, 'id', `rules[${i}]`);
    ids.push(id);
    const path = `rules[${id || i}]`;
    const type = r.type as (typeof RULE_TYPES)[number];
    if (!RULE_TYPES.includes(type)) c.fail(`${path}.type`, `unknown rule type ${String(r.type)}`);
    total += c.number(r, 'points', path, { min: 0, integer: true }) || 0;
    const critical = c.bool(r, 'critical', path);
    if (r.criticalOn !== undefined && (r.criticalOn !== 'forbidden' || critical !== true)) {
      c.fail(`${path}.criticalOn`, 'must be "forbidden" on a critical rule');
    }
    c.string(r, 'feedbackKey', path);
    const scopedTo = c.strings(r, 'variants', path, true);
    c.subset(scopedTo, variantIds, `${path}.variants`, 'variant');
    c.bool(r, 'needsReview', path, true);
    const params = c.object(r.params, `${path}.params`);
    if (params === null || !RULE_TYPES.includes(type)) return;

    const appliesIn = scopedTo ?? [...variantIds];
    const stepRef = (key: string, interactions?: readonly InteractionType[]): Step | undefined => {
      const stepId = c.string(params, key, `${path}.params`);
      const step = steps.get(stepId);
      if (stepId !== '' && step === undefined) c.fail(`${path}.params.${key}`, `unknown step ${stepId}`);
      if (step !== undefined && interactions !== undefined && !interactions.includes(step.interaction)) {
        c.fail(`${path}.params.${key}`, `step ${stepId} must be ${interactions.join(' or ')}`);
      }
      // A rule must not apply in a variant where its step never runs
      if (step?.variants !== undefined) {
        for (const v of appliesIn) if (!step.variants.includes(v)) c.fail(path, `applies in ${v} but step ${stepId} does not run there`);
      }
      return step;
    };

    switch (type) {
      case 'completed':
        stepRef('step');
        if (params.where !== undefined) c.object(params.where, `${path}.params.where`);
        break;
      case 'order':
        stepRef('before');
        stepRef('after');
        break;
      case 'time_limit':
        stepRef('step');
        c.number(params, 'seconds', `${path}.params`, { min: 1 });
        break;
      case 'correct_choice': {
        const step = stepRef('step', WITH_OPTIONS);
        const partial = c.bool(params, 'partial', `${path}.params`, true);
        if (partial === true && step !== undefined && !MULTI_SELECT.includes(step.interaction)) {
          c.fail(`${path}.params.partial`, 'only for choose_many and checklist steps');
        }
        checkCorrect(c, params.correct, step, appliesIn, `${path}.params.correct`);
        break;
      }
      case 'no_forbidden': {
        const tag = c.string(params, 'tag', `${path}.params`);
        if (tag !== '' && !forbiddenTags.has(tag)) c.fail(`${path}.params.tag`, `no forbidden option has tag ${tag}`);
        break;
      }
      case 'hold':
        stepRef('step', ['aim_and_hold']);
        c.number(params, 'minOnTargetSec', `${path}.params`, { min: 0 });
        c.number(params, 'maxOffTargetRatio', `${path}.params`, { min: 0, max: 1 });
        break;
      case 'zone_accuracy':
        stepRef('step', ['mark_zone']);
        c.number(params, 'toleranceM', `${path}.params`, { min: 0.01 });
        break;
    }
  });
  c.unique(ids, 'scenario.rules');
  if (total !== TOTAL_POINTS) c.fail('scenario.rules', `points sum to ${total}, must be ${TOTAL_POINTS}`);
}

function checkCorrect(c: Checker, value: unknown, step: Step | undefined, appliesIn: string[], path: string): void {
  const optionIds = new Set(step === undefined ? [] : stepOptions(step).map((o) => o.id));
  const checkList = (list: unknown, p: string) => {
    if (!Array.isArray(list) || list.length === 0 || !list.every((x) => typeof x === 'string')) {
      c.fail(p, 'must be a non-empty list of option ids');
      return;
    }
    if (step !== undefined) for (const id of list as string[]) if (!optionIds.has(id)) c.fail(p, `unknown option ${id}`);
  };
  if (Array.isArray(value)) {
    checkList(value, path);
    return;
  }
  const map = c.object(value, path);
  if (map === null) return;
  for (const v of appliesIn) {
    if (map[v] === undefined) c.fail(path, `no correct options for variant ${v}`);
    else checkList(map[v], `${path}.${v}`);
  }
}
