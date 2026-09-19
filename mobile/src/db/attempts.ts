import { attemptPayload } from '@/core/sync/payloads';

import { db, enqueueOutbox, nowSeconds } from './database';

/** The docs/03 AttemptResult fields the attempts table indexes; the full result is stored as JSON. */
export interface StoredAttemptResult {
  attemptId: string;
  scenarioId: string;
  scenarioVersion: number;
  variant: string;
  seed: number;
  mode: 'ar' | 'tabletop';
  startedAt: number;
  durationSec: number;
  scorePercent: number;
  passed: boolean;
}

export interface AttemptRecord<Result extends StoredAttemptResult = StoredAttemptResult> {
  id: string;
  workerId: string;
  result: Result;
  createdAt: number;
}

interface AttemptRow {
  id: string;
  worker_id: string;
  result_json: string;
  created_at: number;
}

function fromRow<Result extends StoredAttemptResult>(r: AttemptRow): AttemptRecord<Result> {
  return { id: r.id, workerId: r.worker_id, result: JSON.parse(r.result_json) as Result, createdAt: r.created_at };
}

/**
 * Store a finished attempt. `eventsJson` is the exact text the result's `eventsSha256` was
 * computed over (docs/03), so it is stored as given, not re-serialized.
 */
export function saveAttempt<Result extends StoredAttemptResult, Event>(
  workerId: string,
  result: Result,
  events: Event[],
  eventsJson: string,
): void {
  const now = nowSeconds();
  db().withTransactionSync(() => {
    db().runSync(
      `INSERT INTO attempts (id, worker_id, scenario_id, scenario_version, variant, seed, mode, started_at,
         duration_sec, score_percent, passed, result_json, events_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      result.attemptId,
      workerId,
      result.scenarioId,
      result.scenarioVersion,
      result.variant,
      result.seed,
      result.mode,
      result.startedAt,
      result.durationSec,
      result.scorePercent,
      result.passed ? 1 : 0,
      JSON.stringify(result),
      eventsJson,
      now,
    );
    enqueueOutbox('attempt', result.attemptId, attemptPayload(workerId, result, events), now);
  });
}

export function getAttempt<Result extends StoredAttemptResult>(id: string): AttemptRecord<Result> | null {
  const row = db().getFirstSync<AttemptRow>('SELECT id, worker_id, result_json, created_at FROM attempts WHERE id = ?', id);
  return row === null ? null : fromRow<Result>(row);
}

/** Newest first. */
export function listAttempts<Result extends StoredAttemptResult>(workerId: string): AttemptRecord<Result>[] {
  return db()
    .getAllSync<AttemptRow>(
      'SELECT id, worker_id, result_json, created_at FROM attempts WHERE worker_id = ? ORDER BY started_at DESC, id DESC',
      workerId,
    )
    .map((r) => fromRow<Result>(r));
}
