/** docs/02 scenario JSON contract (D-016, D-017). */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const INTERACTION_TYPES = [
  'narration',
  'place_on_plane',
  'tap_target',
  'choose_one',
  'choose_many',
  'aim_and_hold',
  'find_marker',
  'move_to',
  'mark_zone',
  'checklist',
  'decision',
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Interaction types whose `choice_made` carries `options[]` rather than `option`. */
export const MULTI_SELECT: readonly InteractionType[] = ['choose_many', 'checklist'];
/** Interaction types that carry `params.options`. */
export const WITH_OPTIONS: readonly InteractionType[] = ['choose_one', 'choose_many', 'checklist', 'decision'];

export const RULE_TYPES = [
  'completed',
  'order',
  'time_limit',
  'correct_choice',
  'no_forbidden',
  'hold',
  'zone_accuracy',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export interface ScenarioOption {
  id: string;
  labelKey: string;
  forbidden?: boolean;
  tag?: string;
  forbiddenVariants?: string[];
  needsReview?: boolean;
}

export interface Step {
  id: string;
  interaction: InteractionType;
  instructionKey: string;
  audioKey: string;
  params: JsonObject;
  timeLimitSec?: number;
  variants?: string[];
  needsReview?: boolean;
}

export interface Rule {
  id: string;
  type: RuleType;
  params: JsonObject;
  points: number;
  critical: boolean;
  criticalOn?: 'forbidden';
  variants?: string[];
  feedbackKey: string;
  needsReview?: boolean;
}

export interface Variant {
  id: string;
  params: JsonObject;
  needsReview?: boolean;
}

export interface Scenario {
  id: string;
  version: number;
  domain: string;
  titleKey: string;
  needsReview: boolean;
  passThresholdPercent: number;
  validityDays: number;
  timeLimitSec: number;
  setup: { requiresPlane: boolean; markers: string[] };
  variants: Variant[];
  steps: Step[];
  rules: Rule[];
}
