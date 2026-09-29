/** docs/03 event model and result shape. */
import type { JsonObject } from '../scenarios/types';

export const EVENT_TYPES = [
  'step_started',
  'step_completed',
  'step_skipped',
  'choice_made',
  'target_hit',
  'hold_progress',
  'marker_found',
  'position_reached',
  'zone_marked',
  'forbidden_action',
  'attempt_aborted',
  // Neutral: the worker re-placed the drifted overlay (D-036). No rule reads it.
  'anchor_repositioned',
  // operate_extinguisher gestures (D-038): PASS "Pull", and the "Squeeze" lever pressed / released
  'pin_pulled',
  'discharge_started',
  'discharge_stopped',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** `t`: seconds since attempt start (monotonic clock), 2 decimals. Append-only; the engine only reads. */
export interface AttemptEvent {
  t: number;
  type: EventType;
  stepId?: string;
  data?: JsonObject;
}

export interface RuleResult {
  ruleId: string;
  earned: number;
  max: number;
  critical: boolean;
  /** Critical rules: false only on a critical failure. Other rules: true when earned === max. */
  passed: boolean;
  feedbackKey: string;
}

/** What `evaluate` computes from (scenario, variant, events). */
export interface Evaluation {
  scorePercent: number;
  passed: boolean;
  criticalFailures: string[];
  rules: RuleResult[];
}

export type AttemptMode = 'ar' | 'tabletop';

/** `training`: the full module. `refresher`: the shortened run of its critical steps (D-044). */
export type AttemptKind = 'training' | 'refresher';

/** Which refresher stage an attempt was: days after the first pass (`content/refresher.json`). */
export interface RefresherInfo {
  dueDay: number;
}

/** docs/03 "Result" JSON, stored in attempts.result_json and synced as-is. */
export interface AttemptResult {
  attemptId: string;
  scenarioId: string;
  scenarioVersion: number;
  variant: string;
  seed: number;
  mode: AttemptMode;
  /** Absent in attempts stored before D-044, which were all `training`. */
  kind?: AttemptKind;
  /** Present exactly when `kind` is `refresher`. */
  refresher?: RefresherInfo;
  startedAt: number;
  durationSec: number;
  scorePercent: number;
  passed: boolean;
  criticalFailures: string[];
  rules: RuleResult[];
  eventsSha256: string;
}
