import { deletedWorker, editedWorker, type WorkerFields } from '@/core/workers/edit';
import { workerPayload, type WorkerRecord } from '@/core/sync/payloads';

import { db, enqueueOutbox, newId, nowSeconds } from './database';

interface WorkerRow {
  id: string;
  display_name: string;
  employee_code: string | null;
  site_code: string;
  preferred_lang: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function fromRow(r: WorkerRow): WorkerRecord {
  return {
    id: r.id,
    displayName: r.display_name,
    employeeCode: r.employee_code,
    siteCode: r.site_code,
    preferredLang: r.preferred_lang,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export interface NewWorker extends WorkerFields {
  siteCode: string;
}

export function createWorker(input: NewWorker): WorkerRecord {
  const now = nowSeconds();
  const worker: WorkerRecord = { id: newId(), ...input, createdAt: now, updatedAt: now, deletedAt: null };
  db().withTransactionSync(() => {
    db().runSync(
      `INSERT INTO workers (id, display_name, employee_code, site_code, preferred_lang, selfie_sha256, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      worker.id,
      worker.displayName,
      worker.employeeCode,
      worker.siteCode,
      worker.preferredLang,
      worker.createdAt,
      worker.updatedAt,
    );
    enqueueOutbox('worker', worker.id, workerPayload(worker), now);
  });
  return worker;
}

/**
 * Change name, employee code and language, with its outbox row in the same transaction (docs/05).
 * Returns the stored worker; a deleted or unknown worker gives null. An edit that changes
 * nothing stores and syncs nothing.
 */
export function updateWorker(id: string, fields: WorkerFields): WorkerRecord | null {
  const worker = getWorker(id);
  if (worker === null) return null;
  const updated = editedWorker(worker, fields, nowSeconds());
  if (updated === null) return worker;
  db().withTransactionSync(() => {
    db().runSync(
      'UPDATE workers SET display_name = ?, employee_code = ?, preferred_lang = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      updated.displayName,
      updated.employeeCode,
      updated.preferredLang,
      updated.updatedAt,
      updated.id,
    );
    enqueueOutbox('worker', updated.id, workerPayload(updated), updated.updatedAt);
  });
  return updated;
}

export function setPreferredLang(workerId: string, lang: string): void {
  const worker = getWorker(workerId);
  if (worker !== null) updateWorker(workerId, { displayName: worker.displayName, employeeCode: worker.employeeCode, preferredLang: lang });
}

/**
 * Soft delete (docs/05, D-035): sets `deleted_at` and queues the change for sync. The row stays,
 * so the worker's attempts and certificates keep their reference. Returns false if the worker
 * is unknown or already deleted (then nothing is written).
 */
export function deleteWorker(id: string): boolean {
  const worker = getWorker(id);
  const deleted = worker === null ? null : deletedWorker(worker, nowSeconds());
  if (deleted === null) return false;
  db().withTransactionSync(() => {
    db().runSync(
      'UPDATE workers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      deleted.deletedAt,
      deleted.updatedAt,
      deleted.id,
    );
    enqueueOutbox('worker', deleted.id, workerPayload(deleted), deleted.updatedAt);
  });
  return true;
}

/** An active worker; deleted workers are gone from every screen (list, ID card scan, worker page). */
export function getWorker(id: string): WorkerRecord | null {
  const row = db().getFirstSync<WorkerRow>('SELECT * FROM workers WHERE id = ? AND deleted_at IS NULL', id);
  return row === null ? null : fromRow(row);
}

/** Active workers for the Home picker. */
export function listWorkers(): WorkerRecord[] {
  return db()
    .getAllSync<WorkerRow>('SELECT * FROM workers WHERE deleted_at IS NULL ORDER BY display_name COLLATE NOCASE')
    .map(fromRow);
}
