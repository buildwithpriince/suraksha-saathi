# 01 — Architecture

## Components
```
+---------------------------- Android app (Unity) ----------------------------+
|  UI Toolkit screens  ->  ScenarioPlayer (AR or Tabletop)  ->  Core engine   |
|                                     |                         (pure C#)     |
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

## App flow (screens)
Boot -> (first run) Device setup (choose site, register) -> Home
Home -> Kiosk login (scan worker ID QR or pick worker) -> Module list -> Pre-brief (voice)
 -> AR training (or Tabletop) -> Result (per-rule feedback) -> [all required passed] Certificate QR
Home -> Verify (scan certificate QR) -> Result card
Home -> Settings (language, sync now, device status)

## Scenes
| Scene | Purpose |
|---|---|
| Boot | AR availability check, DB migration, locale load, route to Setup or Home |
| Home | All non-AR screens as UI Toolkit panels |
| ARTraining | AR Session Origin, plane + image managers, ScenarioPlayer |
| TabletopTraining | Virtual room at table scale, same ScenarioPlayer, touch camera |
| Verify | Camera QR scan + verification result |

## Key design choices (see DECISIONS.md for rationale)
- Scenario steps are data (`content/scenarios/*.json`), played by one generic player.
- Scoring lives in pure C# Core and is unit-tested outside Unity.
- Signed tokens are compact `header.body.sig` strings; verifiers never re-serialize JSON.
