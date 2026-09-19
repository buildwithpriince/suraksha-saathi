/**
 * docs/05 "Device SQLite (app)". Times are UTC unix seconds; ids are UUIDv7 text.
 * Migrations run in order; `PRAGMA user_version` holds the number applied. Append, never edit.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE device (
    id TEXT PRIMARY KEY NOT NULL,
    site_code TEXT NOT NULL,
    public_key TEXT NOT NULL,
    -- docs/05 column kept for the contract; the key lives in expo-secure-store (mobile/CLAUDE.md), so NULL
    private_key_enc TEXT,
    attestation_token TEXT,
    status TEXT NOT NULL CHECK (status IN ('unregistered', 'pending', 'approved')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE workers (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    employee_code TEXT,
    site_code TEXT NOT NULL,
    preferred_lang TEXT NOT NULL,
    selfie_sha256 TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE attempts (
    id TEXT PRIMARY KEY NOT NULL,
    worker_id TEXT NOT NULL REFERENCES workers (id),
    scenario_id TEXT NOT NULL,
    scenario_version INTEGER NOT NULL,
    variant TEXT NOT NULL,
    seed INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('ar', 'tabletop')),
    started_at INTEGER NOT NULL,
    duration_sec REAL NOT NULL,
    score_percent INTEGER NOT NULL,
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    result_json TEXT NOT NULL,
    events_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX attempts_worker_id ON attempts (worker_id);
  CREATE TABLE certificates (
    id TEXT PRIMARY KEY NOT NULL,
    worker_id TEXT NOT NULL REFERENCES workers (id),
    token TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    status_cache TEXT NOT NULL CHECK (status_cache IN ('valid', 'revoked')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX certificates_worker_id ON certificates (worker_id);
  CREATE TABLE outbox (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('worker', 'attempt', 'certificate')),
    record_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_try_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE revocations (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    token TEXT NOT NULL,
    iat INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_success_at INTEGER,
    last_error TEXT,
    content_version TEXT
  );
  `,
];
