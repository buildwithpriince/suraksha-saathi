# 01 — Architecture

## Components
```
+--------------------- Android app (Expo React Native) -----------------------+
|  expo-router screens ->  ScenarioPlayer (camera or tabletop) -> Core engine |
|                                     |                    (pure TypeScript)  |
|  Verify screen (QR scan) <----------+--- Certificates (sign/verify)         |
|  SQLite: workers, attempts, certificates, outbox, revocations, attestation |
+---------------------------------------|-------------------------------------+
                                        | HTTPS, only when online (sync)
+------------------------ Backend (FastAPI on Render) ------------------------+
|  Device registry + attestation signing (root key)   Sync ingest (idempotent)|
|  Revocation list   Content manifest   Admin + public verify APIs            |
|  PostgreSQL (Supabase)                                                      |
+---------------------------------------|-------------------------------------+
                                        |
+------------------- Dashboard (React on Vercel) -----------------------------+
|  Admin screens (Supabase Auth)            Public /verify (no login)         |
+-----------------------------------------------------------------------------+
```

## Trust model (why offline certificates are safe enough)
1. Backend holds the **root** Ed25519 key. Its public key is baked into the app and dashboard.
2. Each device generates its own Ed25519 key pair on first launch and registers with a site.
3. An admin approves the device; backend returns a **device attestation** signed by root
   (device id, device public key, site, expiry).
4. Offline, the device signs certificates with its device key and embeds the attestation.
5. A verifier checks: root signature on attestation, attestation not expired, device signature
   on certificate, certificate not expired, certificate id not in cached revocation list.
Full format and test vectors: `docs/04-CERTIFICATES.md`.

## Offline model
- Source of truth for a worker's in-progress data is the device until synced; after sync the server is authoritative.
- Every record has a client-generated UUIDv7 id and `created_at` (UTC unix seconds).
- Writes go to local tables and an `outbox` row in the same SQLite transaction.
- Sync runs on app resume and every 10 minutes when online; pushes outbox, pulls revocations,
  content manifest, and attestation status. Details: `docs/05-DATA-AND-SYNC.md`.
  **Not built yet (T-57):** the backend accepts `POST /v1/sync`, but the app has no sync client,
  so the outbox accumulates and never drains. Everything else on the device works without it.

## App flow (screens)
Boot -> (first run) Device setup (choose site, register) -> Home
Home -> Kiosk login (scan worker ID QR or pick worker) -> Module list -> Pre-brief (voice)
  (worker ID card QR text: `SW1:<worker uuid>`, unsigned; printed from the worker page, D-034)
 -> AR training (or Tabletop) -> Result (per-rule feedback) -> [all required passed] Certificate QR
Home -> Verify (scan certificate QR) -> Result card
Home -> Settings (language, sync now, device status)

## Screens (`mobile/src/app/`, one file per route)
| Route | Purpose |
|---|---|
| `_layout` | Font load, i18n init, shared header; splash until ready |
| `index` | Home: site and pending-sync line, worker list, scan card, verify, settings |
| `setup` | First run: choose site, generate the device key, register |
| `enrol`, `worker-edit/[id]` | Enrol a worker; edit or soft-delete one |
| `worker/[id]` | Worker detail, module list, switches to their language |
| `card/[workerId]` | Printable worker ID card (QR `SW1:<uuid>`, D-034) |
| `scan` | Kiosk login: scan a worker ID card QR |
| `train/[scenarioId]` | Camera permission gate, then one attempt in `ar` or `tabletop` |
| `result/[attemptId]` | Per-rule result feedback, tap to hear |
| `certificate/[workerId]` | Issued certificate + QR |
| `verify` | Camera QR scan + verification result |
| `settings` | Language, device status |

Both modes run through the same `training/TrainingRun.tsx`: `ar` draws overlays over the camera
feed anchored to device orientation, `tabletop` draws the same room without the feed. Same steps,
same events, same scoring.

## Key design choices (see DECISIONS.md for rationale)
- Scenario steps are data (`content/scenarios/*.json`), played by one generic player.
- Scoring lives in pure TypeScript (`mobile/src/core/`, no react/react-native/expo imports) and is
  unit-tested in Node with Vitest.
- Signed tokens are compact `header.body.sig` strings; verifiers never re-serialize JSON.
