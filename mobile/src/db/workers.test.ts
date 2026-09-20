import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { saveAttempt, listAttempts } from './attempts';
import { latestCertificate, saveCertificate } from './certificates';
import { db } from './database';
import { MIGRATIONS } from './schema';
import { createWorker, deleteWorker, getWorker, listWorkers, setPreferredLang, updateWorker } from './workers';

// The real schema and SQL, on Node's SQLite instead of expo-sqlite (sqliteForTests.ts)
vi.mock('expo-sqlite', async () => {
  const { openTestDatabase } = await import('./sqliteForTests');
  return { openDatabaseSync: () => openTestDatabase() };
});
vi.mock('@/platform/random', () => ({ randomBytes: (n: number) => new Uint8Array(nodeRandomBytes(n)) }));

interface OutboxRow {
  kind: string;
  record_id: string;
  payload_json: string;
}

const outboxFor = (id: string) =>
  db()
    .getAllSync<OutboxRow>('SELECT kind, record_id, payload_json FROM outbox WHERE record_id = ? ORDER BY rowid', id)
    .map((r) => ({ kind: r.kind, payload: JSON.parse(r.payload_json) as Record<string, unknown> }));

const enrol = (name = 'Ravi Munda') =>
  createWorker({ displayName: name, employeeCode: 'E-102', siteCode: 'DHN-01', preferredLang: 'hi' });

afterEach(() => {
  vi.useRealTimers();
});

describe('schema', () => {
  test('all migrations apply, and workers gain deleted_at (migration 2)', () => {
    expect(db().getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(MIGRATIONS.length);
    const columns = db().getAllSync<{ name: string }>('PRAGMA table_info(workers)').map((c) => c.name);
    expect(columns).toContain('deleted_at');
  });
});

describe('edit (D-035)', () => {
  test('stores the new fields and queues one outbox row with them', () => {
    const w = enrol();
    const updated = updateWorker(w.id, { displayName: 'Ravi K. Munda', employeeCode: null, preferredLang: 'sat' });
    expect(getWorker(w.id)).toEqual(updated);
    expect(updated).toMatchObject({ displayName: 'Ravi K. Munda', employeeCode: null, preferredLang: 'sat', deletedAt: null });
    const rows = outboxFor(w.id);
    expect(rows).toHaveLength(2); // enrol + edit
    expect(rows[1]).toEqual({
      kind: 'worker',
      payload: expect.objectContaining({ displayName: 'Ravi K. Munda', employeeCode: null, preferredLang: 'sat', deletedAt: null, updatedAt: updated!.updatedAt }),
    });
  });

  test('an edit that changes nothing writes nothing', () => {
    const w = enrol();
    updateWorker(w.id, { displayName: w.displayName, employeeCode: w.employeeCode, preferredLang: w.preferredLang });
    expect(outboxFor(w.id)).toHaveLength(1);
  });

  test('two edits in the same second still sync in order (updatedAt strictly increases)', () => {
    vi.useFakeTimers({ now: 1_789_000_000_000 });
    const w = enrol();
    setPreferredLang(w.id, 'sat');
    updateWorker(w.id, { displayName: 'Ravi Munda', employeeCode: 'E-103', preferredLang: 'sat' });
    const stamps = outboxFor(w.id).map((r) => r.payload.updatedAt as number);
    expect(stamps).toEqual([1_789_000_000, 1_789_000_001, 1_789_000_002]);
  });
});

describe('soft delete (D-035)', () => {
  test('hides the worker everywhere but keeps the row, and queues one outbox row', () => {
    vi.useFakeTimers({ now: 1_789_000_500_000 });
    const w = enrol('Deleted Person');
    expect(deleteWorker(w.id)).toBe(true);

    expect(getWorker(w.id)).toBeNull();
    expect(listWorkers().map((x) => x.id)).not.toContain(w.id);
    const row = db().getFirstSync<{ deleted_at: number; display_name: string }>('SELECT deleted_at, display_name FROM workers WHERE id = ?', w.id);
    expect(row).toEqual({ deleted_at: 1_789_000_501, display_name: 'Deleted Person' });

    const rows = outboxFor(w.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.payload).toMatchObject({ deletedAt: 1_789_000_501, updatedAt: 1_789_000_501, displayName: 'Deleted Person' });
  });

  test('keeps the worker\'s attempts and certificates intact', () => {
    const w = enrol();
    const result = {
      attemptId: '0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a70',
      scenarioId: 'FIRE_01',
      scenarioVersion: 1,
      variant: 'ordinary',
      seed: 7,
      mode: 'ar' as const,
      startedAt: 1_789_000_000,
      durationSec: 120,
      scorePercent: 90,
      passed: true,
      rules: [],
    };
    saveAttempt(w.id, result, [], '[]');
    saveCertificate({ id: '0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a71', workerId: w.id, token: 'SS1.x.y', issuedAt: 1_789_000_100, expiresAt: 1_820_536_100 });

    deleteWorker(w.id);

    expect(listAttempts(w.id).map((a) => a.id)).toEqual([result.attemptId]);
    expect(latestCertificate(w.id)?.token).toBe('SS1.x.y');
    expect(db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM workers WHERE id = ?', w.id)?.n).toBe(1);
  });

  test('deleting twice, or editing after delete, writes nothing', () => {
    const w = enrol();
    deleteWorker(w.id);
    expect(deleteWorker(w.id)).toBe(false);
    expect(updateWorker(w.id, { displayName: 'Back again', employeeCode: null, preferredLang: 'hi' })).toBeNull();
    expect(outboxFor(w.id)).toHaveLength(2); // enrol + delete only
  });

  test('the app never hard-deletes a worker, attempt or certificate (docs/05)', () => {
    const dir = new URL('.', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      expect(source, file).not.toMatch(/DELETE\s+FROM\s+(workers|attempts|certificates)\b/i);
    }
  });
});
