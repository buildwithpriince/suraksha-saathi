# 06 — REST API (FastAPI, base path `/v1`)

Errors: `{"error": {"code": "snake_case", "message": "human readable"}}` with proper HTTP status.
Endpoint-specific codes are listed with the endpoint (e.g. `missing_worker`). Otherwise the code comes
from the status: 400 `bad_request` · 401 `unauthorized` · 403 `forbidden` · 404 `not_found` ·
405 `method_not_allowed` · 409 `conflict` · 413 `payload_too_large` · 422 `validation_error` ·
429 `rate_limited` · 500 `internal_error` · any other `http_<status>`. `validation_error` messages name
fields (`body.deviceId: Field required`) and never echo submitted values; `internal_error` carries no details.
Auth: **device** = signed headers (docs/05); **admin** = `Authorization: Bearer <Supabase JWT>`; **public** = none.
Admin auth (D-020): the JWT must verify against the Supabase project JWKS (ES256/RS256/EdDSA; never HS256),
`aud` = `authenticated`, `iss` = `<SUPABASE_URL>/auth/v1`. The role comes from `admin_profiles` by `sub`:
no token or a bad one -> 401 `unauthorized`; a valid token without a profile, or a supervisor on an
admin-only route -> 403 `forbidden`. 503 when the server lacks `SUPABASE_JWKS_URL` or the root key.

## Service endpoints
### GET /v1/health — public
Res 200: `{"status":"ok"}`. Liveness only (the process is up); does not check the database.
Render's health-check path.

## Device endpoints
### POST /v1/devices/register — public (rate-limited)
Req: `{"deviceId":"uuid","siteCode":"DHN-01","label":"Kiosk tablet 1","publicKey":"b64url"}`
Res 201: `{"status":"pending"}` · 409 if id exists with a different key.
Same id + same key again (a retry) -> 201 with the device's current status (`pending|approved|revoked`).
422 `validation_error` for an unknown `siteCode` (`body.siteCode: Unknown site code`) or a `publicKey` that is
not base64url of a canonical prime-order Ed25519 point (D-015). `label` ≤ 64 chars. 429 `rate_limited` after
10 registrations per client IP per minute.

### GET /v1/devices/me/attestation — device (pending allowed)
Res 200: `{"status":"pending|approved|revoked","attestation":"SA1...|null","expiresAt":1819536000}`
`attestation` and `expiresAt` are `null` unless `status` is `approved`. Revoked devices are answered too.

### POST /v1/sync — device
Req:
```json
{"items":[
  {"kind":"worker","id":"uuid","payload":{"displayName":"Ravi Munda","employeeCode":null,"siteCode":"DHN-01","preferredLang":"hi","updatedAt":1789000000}},
  {"kind":"attempt","id":"uuid","payload":{"workerId":"uuid","result":{"...AttemptResult (docs/03)":""},"events":[]}},
  {"kind":"certificate","id":"uuid","payload":{"workerId":"uuid","token":"SS1..."}}
]}
```
Res 200: `{"accepted":["uuid"],"rejected":[{"id":"uuid","code":"missing_worker","retryable":true}]}`
Max 50 items, max body 2 MB.
Rejection codes: `missing_worker` (retryable) · `conflict_immutable` · `invalid_payload` · `unknown_scenario` ·
`invalid_certificate` (none of the last four are retryable). Ids are echoed exactly as sent. Whole-request
errors: 422 `validation_error` (envelope), 413 `payload_too_large`. Rules: docs/05 "Sync ingest rules".

### GET /v1/revocations — device or public
Res 200: `{"token":"SR1...","iat":1789500000}`
The newest root-signed list (D-023): all revoked `cid`s, sorted, lowercase. Re-signed on every revoke. Before
the first revocation it is a signed empty list. Needs no auth.

### GET /v1/content/manifest — device or public
Res 200: `{"contentVersion":"2026.09.1","scenarios":[{"id":"FIRE_01","version":1},{"id":"GAS_01","version":1}]}`
`contentVersion` comes from `content/manifest.json`; `scenarios` lists the newest version of each
`content/scenarios/*.json`, sorted by id (D-024).

## Public endpoints
### GET /v1/public/verify?token=SS1... — public
Res 200: `{"status":"VALID|EXPIRED|REVOKED|INVALID_FORMAT|INVALID_ATTESTATION|INVALID_SIGNATURE","workerName":"Ravi Munda","site":"DHN-01","modules":[{"id":"FIRE_01","score":86}],"issuedAt":1789000000,"expiresAt":1820536000,"checkedAt":1789100000}`
(For non-VALID signature failures, omit worker fields.)
Worker fields are present for VALID, EXPIRED and REVOKED (both signatures verified) and omitted for every
`INVALID_*`. Server clock plus the live SR1 list. Missing `token` -> 422; longer than 4096 chars -> 422.

## Admin endpoints (JWT; supervisors see only their `site_ids`)
| Method & path | Purpose | Response shape |
|---|---|---|
| GET /v1/admin/overview | KPI cards | `{"workers":n,"certifiedPercent":n,"attempts7d":n,"recertDue30d":n,"topFailedRules":[{"ruleId":"","scenarioId":"","failures":n}]}` |
| GET /v1/admin/sites | Sites list | `[{"id","code","name","district","sector","workers","certifiedPercent"}]` |
| GET /v1/admin/compliance/heatmap | Site × scenario pass rate | `{"sites":["DHN-01"],"scenarios":["FIRE_01","GAS_01"],"cells":[{"site","scenario","passRate","attempts"}]}` |
| GET /v1/admin/workers?site=&q=&page= | Workers | `{"items":[{"id","displayName","site","certStatus","lastAttemptAt"}],"total":n}` |
| GET /v1/admin/workers/{id} | Worker detail | worker + attempts[] + certificates[] |
| GET /v1/admin/attempts?scenario=&passed=&flagged=&page= | Attempts | paginated AttemptSummary |
| GET /v1/admin/attempts/{id} | Rule breakdown + event timeline | full result + events |
| GET /v1/admin/certificates?status=&page= | Certificates | `{"items":[{"id","worker","issuedAt","expiresAt","status"}],"total":n}` |
| POST /v1/admin/certificates/{id}/revoke | Revoke | req `{"reason":"text"}` -> 200 certificate; regenerates SR1 list |
| GET /v1/admin/recert-due?days=30 | Due list | `[{"workerId","displayName","site","expiresAt","daysLeft"}]` |
| GET /v1/admin/devices?status=pending | Devices | `[{"id","label","site","status","lastSeenAt"}]` |
| POST /v1/admin/devices/{id}/approve | Approve + sign attestation (365 days) | device |
| GET /v1/admin/export/attempts.csv?from=&to=&site= | CSV export | text/csv |
