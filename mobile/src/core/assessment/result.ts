import { sha256 } from '@noble/hashes/sha2.js';

import type { Scenario } from '../scenarios/types';
import { encodeUtf8 } from '../utf8';
import { evaluate } from './engine';
import type { AttemptEvent, AttemptMode, AttemptResult } from './types';

export interface FinishedAttempt {
  attemptId: string;
  scenario: Scenario;
  variant: string;
  seed: number;
  mode: AttemptMode;
  startedAt: number; // unix seconds
  durationSec: number;
  events: AttemptEvent[]; // as recorded, in append order
}

/**
 * The docs/03 result plus the exact events text it was hashed over. Store `eventsJson` verbatim
 * (attempts.events_json): `eventsSha256` covers those bytes, not a re-serialization.
 */
export function buildAttemptResult(a: FinishedAttempt): { result: AttemptResult; eventsJson: string } {
  const evaluation = evaluate(a.scenario, a.variant, a.events);
  const eventsJson = JSON.stringify(a.events);
  const result: AttemptResult = {
    attemptId: a.attemptId,
    scenarioId: a.scenario.id,
    scenarioVersion: a.scenario.version,
    variant: a.variant,
    seed: a.seed,
    mode: a.mode,
    startedAt: a.startedAt,
    durationSec: Math.round(a.durationSec * 100) / 100,
    scorePercent: evaluation.scorePercent,
    passed: evaluation.passed,
    criticalFailures: evaluation.criticalFailures,
    rules: evaluation.rules,
    eventsSha256: hex(sha256(encodeUtf8(eventsJson))),
  };
  return { result, eventsJson };
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** docs/03 result screen order: failed criticals first, then rules that lost points, then the rest. */
export function sortRulesForDisplay<T extends { critical: boolean; passed: boolean; earned: number; max: number }>(rules: readonly T[]): T[] {
  const rank = (r: T) => (r.critical && !r.passed ? 0 : r.earned < r.max ? 1 : 2);
  return rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => rank(a.rule) - rank(b.rule) || a.index - b.index)
    .map((x) => x.rule);
}
