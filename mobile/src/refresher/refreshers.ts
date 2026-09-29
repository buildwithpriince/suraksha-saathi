import * as SecureStore from 'expo-secure-store';

import { playableScenarios } from '@/content/scenarios';
import { REFRESHER_CONFIG } from '@/content/refresher';
import type { AttemptResult } from '@/core/assessment/types';
import { DAY_SECONDS, refresherStatus, type RefresherStatus } from '@/core/refresher/schedule';
import { listAttempts } from '@/db/attempts';
import { nowSeconds } from '@/db/database';

// --- Demo clock (D-044) ----------------------------------------------------------------------------
// Settings can move the refresher clock forward so a demo shows day 7 and day 30 without waiting.
// It moves only when refreshers fall due: records, certificates and verification keep real time.
// A device preference in the secure store, like the anchoring settings, so no migration is needed.

const OFFSET_KEY = 'refresher_clock_offset_days_v1';

export function getDemoClockOffsetDays(): number {
  try {
    const days = Number(SecureStore.getItem(OFFSET_KEY) ?? 0);
    return Number.isSafeInteger(days) && days > 0 ? days : 0;
  } catch {
    return 0;
  }
}

export function setDemoClockOffsetDays(days: number): void {
  SecureStore.setItem(OFFSET_KEY, String(Math.max(0, Math.floor(days))));
}

/** "Now" for refresher due dates: real time plus the demo offset. */
export function refresherNow(): number {
  return nowSeconds() + getDemoClockOffsetDays() * DAY_SECONDS;
}

// --- Per worker ------------------------------------------------------------------------------------

export interface ModuleRefresher extends RefresherStatus {
  scenarioId: string;
}

/** Refresher status of every playable module for one worker. */
export function workerRefreshers(workerId: string): ModuleRefresher[] {
  const attempts = listAttempts<AttemptResult>(workerId).map((a) => a.result);
  const now = refresherNow();
  return playableScenarios().map((s) => ({ scenarioId: s.id, ...refresherStatus(s.id, attempts, REFRESHER_CONFIG, now) }));
}

export function hasRefresherDue(workerId: string): boolean {
  return workerRefreshers(workerId).some((m) => m.due !== null);
}
