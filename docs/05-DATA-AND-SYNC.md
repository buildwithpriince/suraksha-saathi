# 05 — Data Model and Sync

## Conventions (both sides)
- IDs: UUIDv7 strings generated where the record is created (device or server).
- Times: UTC unix seconds (integers) in records; `t` in events is seconds since attempt start.
- Enums are lowercase snake_case strings.
- Soft deletes only (`deleted_at`), never hard delete synced data.

## Device SQLite (app)
| Table | Columns |
|---|---|
| `device` (1 row) | id, site_code, public_key, private_key_enc, attestation_token NULL, status (`unregistered/pending/approved`), created_at |
| `workers` | id, display_name, employee_code NULL, site_code, preferred_lang, selfie_sha256 NULL, created_at, updated_at, deleted_at NULL (D-035) |
| `attempts` | id, worker_id, scenario_id, scenario_version, variant, seed, mode (`ar/tabletop`), started_at, duration_sec, score_percent, passed, result_json, events_json, created_at |
| `certificates` | id (=cid), worker_id, token, issued_at, expires_at, status_cache (`valid/revoked`), created_at |
| `outbox` | id, kind (`worker/attempt/certificate`), record_id, payload_json, attempts, last_error NULL, next_try_at, created_at |
| `revocations` (1 row) | token, iat, fetched_at |
| `sync_state` (1 row) | last_success_at, last_error NULL, content_version |
Rules: any insert into `workers/attempts/certificates` inserts its `outbox` row in the same transaction; so
does any worker edit or soft delete (D-035). A soft-deleted worker (`deleted_at` set) is hidden from every
screen; its row, attempts and certificates stay. Each worker change gets an `updated_at` strictly later than
the previous one, so the server's last-write-wins never drops a same-second edit.
`private_key_enc`: prototype stores key bytes obfuscated with a per-install random key; documented limitation.

## Server PostgreSQL (backend)
| Table | Key columns |
|---|---|
| `sites` | id, code (unique, e.g. `DHN-01`), name, district, sector (`coal/steel/mica/iti`) |
| `devices` | id (from device), site_id, label, public_key, status (`pending/approved/revoked`), attestation_token, approved_by, approved_at, last_seen_at |
| `workers` | id, site_id, display_name, employee_code, preferred_lang, created_by_device_id, created_at, updated_at, deleted_at NULL (D-035, T-65) |
| `attempts` | id, worker_id, device_id, scenario_id, scenario_version, variant, seed, mode, started_at, duration_sec, score_percent, passed, result_json (jsonb), events_json (jsonb), flagged bool, flag_reason, received_at |
| `certificates` | id (cid), worker_id, device_id, token, issued_at, expires_at, revoked_at NULL, revoked_reason NULL, revoked_by NULL |
| `admin_profiles` | user_id (Supabase auth uid), role (`admin/supervisor`), site_ids uuid[] |
| `revocation_lists` | id (serial), token (`SR1...`), iat — every SR1 signed; the newest row is served (D-023) |
Indexes: attempts(worker_id), attempts(scenario_id, passed), certificates(expires_at), workers(site_id).
Also stored (T-50): `devices.attestation_expires_at`, `devices.created_at`, `attempts.received_at`,
`certificates.received_at`, `certificates(worker_id)` index. Times are unix-second `bigint`s.
`attempts.score_percent`/`passed` hold the server-recomputed values; the device's claims stay in
`result_json` (D-022). Schema lives in `backend/app/db/models.py` + Alembic; tests run it on SQLite (D-019).

## Device authentication
Every device API call (except register) carries:
- `X-Device-Id`: device id
- `X-Timestamp`: unix seconds (server rejects if |now − ts| > 300)
- `X-Signature`: base64url Ed25519 signature by the device key over
  `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(sha256(body))`
Server loads the device's public key; device must be `approved` (register/attestation-status endpoints allow `pending`).
Details (D-021): PATH is the URL path without the query string (`/v1/sync`); TIMESTAMP is the header text
exactly as sent and must be ASCII digits only; `hex` is lowercase; the signature is strict base64url of
64 bytes (D-013). Every failure -> 401 `unauthorized` (message says which: missing headers, clock skew,
unknown device, bad signature). The signature is checked before the status: then pending -> 403 "Device is
not approved yet", revoked -> 403 "Device is revoked". The attestation-status endpoint also answers revoked
devices, so they learn their status. A success updates `devices.last_seen_at`. A replay within the 300 s
window is accepted; every device write is idempotent, so a replay changes nothing.

## Sync algorithm (device)
Trigger: app resume, "Sync now" button, every 10 minutes while app is open and online.
1. `GET /v1/devices/me/attestation` -> store if changed (also handles approval of a pending device).
2. Push: take up to 50 outbox rows with `next_try_at <= now`, ordered by `created_at`
   (workers before attempts before certificates). `POST /v1/sync`.
3. For each `accepted` id: delete outbox row. For each `rejected`: if `retryable` set
   `next_try_at = now + min(2^attempts × 30 s, 1 h)`, else keep with `last_error` and surface in Settings.
4. Repeat step 2 until outbox empty or a request fails.
5. `GET /v1/revocations` -> verify root signature -> store.
6. `GET /v1/content/manifest` -> if `contentVersion` differs, show "Content update available" (no auto-download in prototype).
7. Write `sync_state`.

## Sync ingest rules (server)
- Upsert by id. Same id + identical payload -> accepted (idempotent). Same id + different payload
  -> `workers`: last-write-wins by `updated_at`; `attempts`/`certificates`: rejected `conflict_immutable`, not retryable.
- Attempt validation: recompute `scorePercent` from `result_json.rules` and `passed` from critical
  rules + scenario threshold. Mismatch -> store with `flagged=true, flag_reason`. Still accepted.
- Certificate validation: run the `docs/04` verification with server time; `INVALID_*` -> rejected
  `invalid_certificate` (not retryable). Worker must exist (else retryable `missing_worker`).
- Attempt referencing an unknown worker -> rejected `missing_worker`, retryable.
- Clarifications (D-022). Items are processed in order in one transaction, so a worker earlier in the batch
  exists for later attempts. Checks that can never pass run before retryable ones, so permanent problems
  are never reported as retryable. Nothing is written for a rejected item.
  - Item `id` not a UUID, or `payload` failing its schema (strict JSON types) -> `invalid_payload`, not retryable.
  - Worker `siteCode` unknown or not the sending device's site, or an existing worker at another site ->
    `invalid_payload`. LWW: a strictly newer `updatedAt` overwrites; older or equal is accepted unchanged.
    `deletedAt` (D-035) is one of the fields LWW applies; once set it is never cleared (T-65).
  - Attempt: `result.attemptId` must equal the item id (`invalid_payload`); `scenarioId`+`scenarioVersion` must
    exist in `/content` (`unknown_scenario`, not retryable). Identical = same workerId, result and events.
  - Attempt recheck: the server trusts per-rule `earned`/`passed` but takes rule `max`, `critical` and
    variant scoping from the scenario file. A critical rule without `criticalOn` fails when it earns 0.
    Stored `score_percent`/`passed` are the server's values; `flag_reason` lists every disagreement
    (score, passed, criticalFailures, unknown/missing/duplicate rules, unknown variant). `eventsSha256` is
    not checked (the server can't reproduce the device's exact bytes).
  - Certificate: VALID, EXPIRED and REVOKED are accepted (the signatures verified). It is also
    `invalid_certificate` if `cid` ≠ item id, `wid` ≠ `payload.workerId`, or `site` ≠ the worker's site.
    Identical = same workerId and token. `device_id` = the sending device.
  - Envelope: bad JSON, unknown `kind`, or more than 50 items -> 422 for the whole request; body over 2 MB -> 413.
