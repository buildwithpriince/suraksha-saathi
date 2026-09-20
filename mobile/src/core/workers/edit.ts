/**
 * Enrol, edit and soft delete of workers (D-035). Pure rules; `db/workers.ts` stores the results
 * with their outbox rows. Workers are never hard-deleted (docs/05): attempts and certificates
 * reference them.
 */
import { isLocale } from '../locales';
import type { WorkerRecord } from '../sync/payloads';

/** docs/04: the certificate's `wn` is at most 24 characters, so enrolment caps the name there. */
export const MAX_WORKER_NAME = 24;
/** docs/06 sync schema: `employeeCode` is at most 40 characters. */
export const MAX_EMPLOYEE_CODE = 40;

export type WorkerFields = Pick<WorkerRecord, 'displayName' | 'employeeCode' | 'preferredLang'>;
export type WorkerFieldError = 'name_required' | 'name_too_long' | 'code_too_long' | 'bad_language';

/** Form text -> stored fields: spaces trimmed and collapsed in the name; an empty code is null. */
export function workerFields(input: {
  displayName: string;
  employeeCode: string;
  preferredLang: string;
}): { ok: true; fields: WorkerFields } | { ok: false; error: WorkerFieldError } {
  const displayName = input.displayName.trim().replace(/\s+/g, ' ');
  const code = input.employeeCode.trim();
  if (displayName === '') return { ok: false, error: 'name_required' };
  if ([...displayName].length > MAX_WORKER_NAME) return { ok: false, error: 'name_too_long' };
  if ([...code].length > MAX_EMPLOYEE_CODE) return { ok: false, error: 'code_too_long' };
  if (!isLocale(input.preferredLang)) return { ok: false, error: 'bad_language' };
  return { ok: true, fields: { displayName, employeeCode: code === '' ? null : code, preferredLang: input.preferredLang } };
}

/**
 * `updatedAt` for a change: now, but always after the previous write. The server keeps a worker
 * change only if its `updatedAt` is strictly newer (docs/05), so two edits in one second would
 * otherwise lose the second.
 */
export function nextUpdatedAt(previous: number, now: number): number {
  return Math.max(now, previous + 1);
}

/** The worker after an edit, or null if nothing changes (then nothing is stored or synced). */
export function editedWorker(worker: WorkerRecord, fields: WorkerFields, now: number): WorkerRecord | null {
  if (worker.deletedAt !== null) return null;
  const same =
    worker.displayName === fields.displayName &&
    worker.employeeCode === fields.employeeCode &&
    worker.preferredLang === fields.preferredLang;
  return same ? null : { ...worker, ...fields, updatedAt: nextUpdatedAt(worker.updatedAt, now) };
}

/** The worker soft-deleted (`deletedAt` set, nothing else changes), or null if already deleted. */
export function deletedWorker(worker: WorkerRecord, now: number): WorkerRecord | null {
  if (worker.deletedAt !== null) return null;
  const at = nextUpdatedAt(worker.updatedAt, now);
  return { ...worker, deletedAt: at, updatedAt: at };
}
