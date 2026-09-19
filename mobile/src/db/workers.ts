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
  };
}

/** docs/04: `wn` is at most 24 characters, so enrolment caps the name there. */
export const MAX_WORKER_NAME = 24;

export interface NewWorker {
  displayName: string;
  employeeCode: string | null;
  siteCode: string;
  preferredLang: string;
}

export function createWorker(input: NewWorker): WorkerRecord {
  const now = nowSeconds();
  const worker: WorkerRecord = { id: newId(), ...input, createdAt: now, updatedAt: now };
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

export function setPreferredLang(workerId: string, lang: string): void {
  const worker = getWorker(workerId);
  if (worker === null || worker.preferredLang === lang) return;
  const updated: WorkerRecord = { ...worker, preferredLang: lang, updatedAt: nowSeconds() };
  db().withTransactionSync(() => {
    db().runSync(
      'UPDATE workers SET preferred_lang = ?, updated_at = ? WHERE id = ?',
      updated.preferredLang,
      updated.updatedAt,
      updated.id,
    );
    enqueueOutbox('worker', updated.id, workerPayload(updated), updated.updatedAt);
  });
}

export function getWorker(id: string): WorkerRecord | null {
  const row = db().getFirstSync<WorkerRow>('SELECT * FROM workers WHERE id = ?', id);
  return row === null ? null : fromRow(row);
}

export function listWorkers(): WorkerRecord[] {
  return db().getAllSync<WorkerRow>('SELECT * FROM workers ORDER BY display_name COLLATE NOCASE').map(fromRow);
}
