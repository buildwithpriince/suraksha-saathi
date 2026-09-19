import * as SQLite from 'expo-sqlite';

import { uuidv7, unixSeconds } from '@/core/ids';
import type { OutboxKind } from '@/core/sync/payloads';
import { randomBytes } from '@/platform/random';

import { MIGRATIONS } from './schema';

let instance: SQLite.SQLiteDatabase | null = null;

/** The app database, opened and migrated on first use. */
export function db(): SQLite.SQLiteDatabase {
  if (instance === null) {
    const opened = SQLite.openDatabaseSync('suraksha-saathi.db');
    opened.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    migrate(opened);
    instance = opened;
  }
  return instance;
}

function migrate(database: SQLite.SQLiteDatabase): void {
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;
  for (let version = applied; version < MIGRATIONS.length; version++) {
    database.withTransactionSync(() => {
      database.execSync(MIGRATIONS[version]!);
      database.execSync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function newId(): string {
  return uuidv7(Date.now(), randomBytes(10));
}

export function nowSeconds(): number {
  return unixSeconds(Date.now());
}

/**
 * Queue a record for sync. Call only inside the transaction that writes the record, so the
 * record and its outbox row commit together (docs/05 rule).
 */
export function enqueueOutbox(kind: OutboxKind, recordId: string, payload: unknown, now: number): void {
  db().runSync(
    `INSERT INTO outbox (id, kind, record_id, payload_json, attempts, last_error, next_try_at, created_at)
     VALUES (?, ?, ?, ?, 0, NULL, ?, ?)`,
    newId(),
    kind,
    recordId,
    JSON.stringify(payload),
    now,
    now,
  );
}

export function outboxCount(): number {
  return db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n ?? 0;
}
