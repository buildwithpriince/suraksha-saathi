/** docs/06 POST /v1/sync item payloads, built when a record is written (outbox, docs/05). */

export type OutboxKind = 'worker' | 'attempt' | 'certificate';

export interface WorkerRecord {
  id: string;
  displayName: string;
  employeeCode: string | null;
  siteCode: string;
  preferredLang: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkerPayload {
  displayName: string;
  employeeCode: string | null;
  siteCode: string;
  preferredLang: string;
  updatedAt: number;
}

export function workerPayload(w: WorkerRecord): WorkerPayload {
  return {
    displayName: w.displayName,
    employeeCode: w.employeeCode,
    siteCode: w.siteCode,
    preferredLang: w.preferredLang,
    updatedAt: w.updatedAt,
  };
}

export interface AttemptPayload<Result, Event> {
  workerId: string;
  result: Result;
  events: Event[];
}

export function attemptPayload<Result, Event>(
  workerId: string,
  result: Result,
  events: Event[],
): AttemptPayload<Result, Event> {
  return { workerId, result, events };
}

export interface CertificatePayload {
  workerId: string;
  token: string;
}

export function certificatePayload(workerId: string, token: string): CertificatePayload {
  return { workerId, token };
}

/** docs/05 sync step 2 order: workers before attempts before certificates. */
export const OUTBOX_KIND_ORDER: Record<OutboxKind, number> = { worker: 0, attempt: 1, certificate: 2 };
