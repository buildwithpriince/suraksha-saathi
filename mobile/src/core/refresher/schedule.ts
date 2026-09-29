/**
 * When a worker is due a refresher (D-044). Pure: `now` is passed in, so the Settings demo clock
 * can move it without touching any record timestamps.
 *
 * Anchor: the worker's first passing training attempt for the module (any scenario version).
 * Stage N (days from `content/refresher.json`) is due once `anchor + N days` has passed, until a
 * passing refresher for stage N or a later stage exists. If several are due, the latest is offered:
 * a worker who missed day 7 and is now past day 30 does the day-30 refresher.
 */
import type { AttemptKind, RefresherInfo } from '../assessment/types';

export const DAY_SECONDS = 86_400;

export interface RefresherConfig {
  /** Days after the first pass, ascending, unique, positive integers. */
  dueDays: number[];
}

/** `content/refresher.json`. Throws on a malformed file: it is bundled, so that is a build bug. */
export function parseRefresherConfig(raw: unknown): RefresherConfig {
  const days = (raw as { dueDays?: unknown } | null)?.dueDays;
  if (!Array.isArray(days) || days.length === 0) throw new Error('refresher.json: dueDays must be a non-empty array');
  for (const [i, d] of days.entries()) {
    if (!Number.isSafeInteger(d) || (d as number) < 1) throw new Error(`refresher.json: dueDays[${i}] must be a positive integer`);
    if (i > 0 && (d as number) <= (days[i - 1] as number)) throw new Error('refresher.json: dueDays must be ascending and unique');
  }
  return { dueDays: [...(days as number[])] };
}

/** The attempt fields the schedule reads (docs/03 AttemptResult; `kind` absent = training). */
export interface ScheduleAttempt {
  scenarioId: string;
  startedAt: number;
  passed: boolean;
  kind?: AttemptKind;
  refresher?: RefresherInfo;
}

export interface RefresherStage {
  dueDay: number;
  /** Unix seconds when this stage became (or becomes) due. */
  dueAt: number;
}

export interface RefresherStatus {
  /** The stage to do now, or null. */
  due: RefresherStage | null;
  /** The next stage not yet due, or null when none is left. */
  next: RefresherStage | null;
}

export const NO_REFRESHER: RefresherStatus = { due: null, next: null };

export function isRefresher(a: { kind?: AttemptKind }): boolean {
  return a.kind === 'refresher';
}

/** First passing training attempt for the module, or null if it was never passed. */
export function refresherAnchor(scenarioId: string, attempts: readonly ScheduleAttempt[]): number | null {
  let anchor: number | null = null;
  for (const a of attempts) {
    if (a.scenarioId === scenarioId && a.passed && !isRefresher(a) && (anchor === null || a.startedAt < anchor)) anchor = a.startedAt;
  }
  return anchor;
}

export function refresherStatus(
  scenarioId: string,
  attempts: readonly ScheduleAttempt[],
  config: RefresherConfig,
  now: number,
): RefresherStatus {
  const anchor = refresherAnchor(scenarioId, attempts);
  if (anchor === null) return NO_REFRESHER;
  // The latest stage a passing refresher covered (a later stage covers the earlier ones)
  const covered = Math.max(
    0,
    ...attempts.filter((a) => a.scenarioId === scenarioId && a.passed && isRefresher(a) && a.refresher !== undefined).map((a) => a.refresher!.dueDay),
  );
  let due: RefresherStage | null = null;
  let next: RefresherStage | null = null;
  for (const dueDay of config.dueDays) {
    if (dueDay <= covered) continue;
    const stage = { dueDay, dueAt: anchor + dueDay * DAY_SECONDS };
    if (stage.dueAt <= now) due = stage;
    else if (next === null) next = stage;
  }
  return { due, next };
}
