# 06 — REST API (FastAPI, base path `/v1`)

Errors: `{"error": {"code": "snake_case", "message": "human readable"}}` with proper HTTP status.
Auth: **device** = signed headers (docs/05); **admin** = `Authorization: Bearer <Supabase JWT>`; **public** = none.

## Device endpoints
### POST /v1/devices/register — public (rate-limited)
Req: `{"deviceId":"uuid","siteCode":"DHN-01","label":"Kiosk tablet 1","publicKey":"b64url"}`
Res 201: `{"status":"pending"}` · 409 if id exists with a different key.

### GET /v1/devices/me/attestation — device (pending allowed)
Res 200: `{"status":"pending|approved|revoked","attestation":"SA1...|null","expiresAt":1819536000}`

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

### GET /v1/revocations — device or public
Res 200: `{"token":"SR1...","iat":1789500000}`

### GET /v1/content/manifest — device or public
Res 200: `{"contentVersion":"2026.09.1","scenarios":[{"id":"FIRE_01","version":1},{"id":"GAS_01","version":1}]}`

## Public endpoints
### GET /v1/public/verify?token=SS1... — public
Res 200: `{"status":"VALID|EXPIRED|REVOKED|INVALID_FORMAT|INVALID_ATTESTATION|INVALID_SIGNATURE","workerName":"Ravi Munda","site":"DHN-01","modules":[{"id":"FIRE_01","score":86}],"issuedAt":1789000000,"expiresAt":1820536000,"checkedAt":1789100000}`
(For non-VALID signature failures, omit worker fields.)

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
