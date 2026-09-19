import { certificatePayload } from '@/core/sync/payloads';

import { db, enqueueOutbox, nowSeconds } from './database';

export interface CertificateRecord {
  id: string; // = cid
  workerId: string;
  token: string;
  issuedAt: number;
  expiresAt: number;
  statusCache: 'valid' | 'revoked';
}

interface CertificateRow {
  id: string;
  worker_id: string;
  token: string;
  issued_at: number;
  expires_at: number;
  status_cache: 'valid' | 'revoked';
}

function fromRow(r: CertificateRow): CertificateRecord {
  return {
    id: r.id,
    workerId: r.worker_id,
    token: r.token,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    statusCache: r.status_cache,
  };
}

export function saveCertificate(cert: Omit<CertificateRecord, 'statusCache'>): void {
  const now = nowSeconds();
  db().withTransactionSync(() => {
    db().runSync(
      `INSERT INTO certificates (id, worker_id, token, issued_at, expires_at, status_cache, created_at)
       VALUES (?, ?, ?, ?, ?, 'valid', ?)`,
      cert.id,
      cert.workerId,
      cert.token,
      cert.issuedAt,
      cert.expiresAt,
      now,
    );
    enqueueOutbox('certificate', cert.id, certificatePayload(cert.workerId, cert.token), now);
  });
}

/** The worker's newest certificate, or null. */
export function latestCertificate(workerId: string): CertificateRecord | null {
  const row = db().getFirstSync<CertificateRow>(
    'SELECT * FROM certificates WHERE worker_id = ? ORDER BY issued_at DESC, id DESC LIMIT 1',
    workerId,
  );
  return row === null ? null : fromRow(row);
}
