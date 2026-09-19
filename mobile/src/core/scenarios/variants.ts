/** docs/02 variants: choice by seed and `"$name"` substitution into step params. */
import type { JsonObject, JsonValue, Scenario, ScenarioOption, Step, Variant } from './types';

const REFERENCE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;

/** docs/02: `variants[seed % variants.length]`; the seed is stored with the attempt. */
export function pickVariant(scenario: Scenario, seed: number): Variant {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('seed must be a non-negative integer');
  return scenario.variants[seed % scenario.variants.length]!;
}

export function findVariant(scenario: Scenario, variantId: string): Variant {
  const variant = scenario.variants.find((v) => v.id === variantId);
  if (variant === undefined) throw new Error(`unknown variant ${variantId}`);
  return variant;
}

/** The variant param name a `"$name"` string refers to, or null for an ordinary string. */
export function referenceName(value: string): string | null {
  return REFERENCE.exec(value)?.[1] ?? null;
}

/** Replace every `"$name"` string, at any depth, with the variant's param `name`. */
export function resolveParams(params: JsonObject, variant: Variant): JsonObject {
  return resolve(params, variant) as JsonObject;
}

function resolve(value: JsonValue, variant: Variant): JsonValue {
  if (typeof value === 'string') {
    const name = referenceName(value);
    if (name === null) return value;
    const replacement = variant.params[name];
    if (replacement === undefined) throw new Error(`variant ${variant.id} has no param ${name}`);
    return replacement;
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, variant));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, variant)]));
  }
  return value;
}

/** docs/02: a step with `variants` runs only in those; elsewhere the player emits `step_skipped`. */
export function stepRunsIn(step: Step, variantId: string): boolean {
  return step.variants === undefined || step.variants.includes(variantId);
}

/** D-016: `forbidden` options are forbidden in `forbiddenVariants` only (default: all). */
export function optionForbiddenIn(option: ScenarioOption, variantId: string): boolean {
  if (option.forbidden !== true) return false;
  return option.forbiddenVariants === undefined || option.forbiddenVariants.includes(variantId);
}

export function stepOptions(step: Step): ScenarioOption[] {
  const options = step.params.options;
  return Array.isArray(options) ? (options as unknown as ScenarioOption[]) : [];
}
