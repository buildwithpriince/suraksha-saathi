# Suraksha Saathi

AR-based vocational safety training and certification for Jharkhand's mining, steel and mica workers.
Smart India Hackathon 2026 · PS 26041 · Team Caffeine Coders

> Work in progress. See `docs/00-PRD.md` for scope and `docs/TASKS.md` for status.

## What it does
- AR safety drills on the real floor via a phone camera (no headset): Fire & Explosion, Gas Leak & Confined Space
- Scores what the worker does, not quiz answers; critical mistakes fail the attempt
- Issues a signed QR certificate that can be verified with no network
- Hindi and Santali, voice-first; the whole worker journey runs in airplane mode
- Web dashboard for compliance, recertification and certificate revocation

## Status
Plainly, so nobody has to guess from the task board.

**Built and working**
- `FIRE_01` and `GAS_01` playable start to finish, in camera mode and in tabletop mode, with identical scoring
- Assessment engine with per-rule result feedback (175 unit tests)
- Offline certificates: issue, QR render, and verify by scanning — no network at any point
- Kiosk login (scan a worker ID card QR or pick the worker; switches to their language) and printable ID cards
- Worker enrol, edit and soft delete; device setup; settings
- English, Hindi and Santali UI with bundled Noto Sans Devanagari
- SQLite with an outbox row written in the same transaction as each record
- Backend: device registry, attestation signing, sync ingest, revocations, admin APIs
- Dashboard: compliance heatmap, workers, attempts, certificates, recertification, devices, public `/verify`

**Not built yet**
- App→backend sync. The backend accepts `POST /v1/sync`, but the app has no sync client yet, so
  the outbox does not drain (T-57). Everything on the device works; nothing leaves it
- Live deployments: backend on Render (T-58), dashboard on Vercel (T-64)
- Recorded narration audio (T-73); Santali is drafted but not yet reviewed by a native speaker (T-72)
- Fire overlay animation polish (T-27); on-device test passes (T-28, T-33, T-44)

**Roadmap**
- The remaining PS safety domains beyond fire and gas
- Hardware-backed key storage, DigiLocker integration, iOS

## Demo
- Video: _link added in T-82_
- Screenshots: _added in T-81_

## Architecture
Expo React Native Android app (offline-first, SQLite + outbox) → FastAPI sync + certificate
authority → React dashboard. Overlays are drawn over the camera feed and anchored to device
orientation; there is no headset and no ARCore dependency. Certificates are signed on the device
with a root-attested device key, so they can be issued and verified with no network.
Details: `docs/01-ARCHITECTURE.md`.
_Diagram added in T-81._

## Repo
| Path | What |
|---|---|
| `mobile/` | Android app (Expo React Native, TypeScript) |
| `backend/` | FastAPI sync + certificate authority |
| `dashboard/` | React admin dashboard + public verify page |
| `content/` | Scenario definitions, strings, trust anchors |
| `docs/` | Specifications |

## Getting started

### Clone (Git LFS required)
Images, audio and fonts are stored in Git LFS. Without it you get small pointer files instead of
the real assets, and the app ships with a broken icon and missing media.
```
git lfs install          # once per machine, before cloning
git clone <repo-url> suraksha-saathi
cd suraksha-saathi
git lfs pull             # only if you cloned before installing Git LFS
```
Run `git lfs pull` before any EAS build too: EAS uploads your working tree, so pointer files
would ship as broken assets.

### Run each app
| App | Needs | Run | Test |
|---|---|---|---|
| `mobile/` | Node.js 20+, a phone with Expo Go or a dev build | `cd mobile && npm install && npx expo start` | `cd mobile && npm test && npm run typecheck` |
| `backend/` | Python 3.12, `uv` | `cd backend && uv sync && uv run fastapi dev app/main.py` | `cd backend && uv run pytest -q` |
| `dashboard/` | Node.js 20+ | `cd dashboard && npm install && npm run dev` | `cd dashboard && npm run typecheck && npm run test && npm run build` |

Android APK (needs an expo.dev login):
`cd mobile && git lfs pull && npx eas-cli@latest build -p android --profile preview`

Full team setup (tools, env vars, secrets, deploys): `SETUP.md`.

## Credits
Noto Sans and Noto Sans Devanagari are used under the SIL Open Font License 1.1.
Other third-party assets with their licenses: _add each asset as it is imported (T-81)_.

## License
MIT — see [`LICENSE`](LICENSE).

## Team
Caffeine Coders — add names and roles.
