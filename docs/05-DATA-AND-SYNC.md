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
| `workers` | id, display_name, employee_code NULL, site_code, preferred_lang, selfie_sha256 NULL, created_at, updated_at |
| `attempts` | id, worker_id, scenario_id, scenario_version, variant, seed, mode (`ar/tabletop`), started_at, duration_sec, score_percent, passed, result_json, events_json, created_at |
| `certificates` | id (=cid), worker_id, token, issued_at, expires_at, status_cache (`valid/revoked`), created_at |
| `outbox` | id, kind (`worker/attempt/certificate`), record_id, payload_json, attempts, last_error NULL, next_try_at, created_at |
| `revocations` (1 row) | token, iat, fetched_at |
| `sync_state` (1 row) | last_success_at, last_error NULL, content_version |
Rules: any insert into `workers/attempts/certificates` inserts its `outbox` row in the same transaction.
`private_key_enc`: prototype stores key bytes obfuscated with a per-install random key; documented limitation.

## Server PostgreSQL (backend)
| Table | Key columns |
|---|---|
| `sites` | id, code (unique, e.g. `DHN-01`), name, district, sector (`coal/steel/mica/iti`) |
| `devices` | id (from device), site_id, label, public_key, status (`pending/approved/revoked`), attestation_token, approved_by, approved_at, last_seen_at |
| `workers` | id, site_id, display_name, employee_code, preferred_lang, created_by_device_id, created_at, updated_at |
| `attempts` | id, worker_id, device_id, scenario_id, scenario_version, variant, seed, mode, started_at, duration_sec, score_percent, passed, result_json (jsonb), events_json (jsonb), flagged bool, flag_reason, received_at |
| `certificates` | id (cid), worker_id, device_id, token, issued_at, expires_at, revoked_at NULL, revoked_reason NULL, revoked_by NULL |
| `admin_profiles` | user_id (Supabase auth uid), role (`admin/supervisor`), site_ids uuid[] |
Indexes: attempts(worker_id), attempts(scenario_id, passed), certificates(expires_at), workers(site_id).

## Device authentication
Every device API call (except register) carries:
- `X-Device-Id`: device id
- `X-Timestamp`: unix seconds (server rejects if |now − ts| > 300)
- `X-Signature`: base64url Ed25519 signature by the device key over
  `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(sha256(body))`
Server loads the device's public key; device must be `approved` (register/attestation-status endpoints allow `pending`).

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
