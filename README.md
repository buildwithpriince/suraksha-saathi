# Suraksha Saathi

AR-based vocational safety training and certification for Jharkhand's mining, steel and mica workers.
Smart India Hackathon 2026 · PS 26041 · Team Caffeine Coders

> Work in progress. See `docs/00-PRD.md` for scope and `docs/TASKS.md` for status.

## What it does
- AR safety drills on the real floor via a phone camera (no headset): Fire & Explosion, Gas Leak & Confined Space
- Scores what the worker does, not quiz answers; critical mistakes fail the attempt
- Issues a signed QR certificate that can be verified with no network
- Hindi and Santali, voice-first; works fully offline; syncs when online
- Web dashboard for compliance, recertification and certificate revocation

## Demo
- Video: _link added in T-82_
- Screenshots: _added in T-81_

## Architecture
Unity Android app (offline-first, SQLite + outbox) → FastAPI sync + certificate authority →
React dashboard. Certificates are signed on the device with a root-attested device key, so they
can be issued and verified with no network. Details: `docs/01-ARCHITECTURE.md`.
_Diagram added in T-81._

## Repo
| Path | What |
|---|---|
| `app-unity/` | Android app (Unity 6.3 LTS, AR Foundation) |
| `backend/` | FastAPI sync + certificate authority |
| `dashboard/` | React admin dashboard + public verify page |
| `content/` | Scenario definitions, strings, trust anchors |
| `docs/` | Specifications |

## Getting started

### Clone (Git LFS required)
Images, audio, fonts, 3D models and plugin DLLs are stored in Git LFS. Without it, Unity sees
small pointer files instead of assets and fails to load plugins.
```
git lfs install          # once per machine, before cloning
git clone <repo-url> suraksha-saathi
cd suraksha-saathi
git lfs pull             # only if you cloned before installing Git LFS
```

### Run each app
| App | Needs | Open / run | Test | Scaffold task |
|---|---|---|---|---|
| `app-unity/` | Unity 6.3 LTS + Android Build Support, .NET 8 SDK | Unity Hub → Add → `app-unity/` | `dotnet test app-unity/CoreTests~` | T-02, T-04 |
| `backend/` | Python 3.12, `uv` | `cd backend && uv sync && uv run fastapi dev app/main.py` | `cd backend && uv run pytest -q` | T-05 |
| `dashboard/` | Node.js 20+ | `cd dashboard && npm install && npm run dev` | `cd dashboard && npm run typecheck && npm run test && npm run build` | T-06 |

Until its scaffold task is done, an app folder contains only its `CLAUDE.md`.
Full team setup (tools, Unity MCP, env vars, secrets): `SETUP.md`.

## Roadmap
Remaining PS safety domains (Machinery and others), hardware-backed keys, DigiLocker integration.

## Credits
Third-party models, VFX, fonts and sounds with their licenses: _add each asset as it is imported (T-81)_.

## License
_To be chosen before the repo is made public (T-83)._

## Team
Caffeine Coders — add names and roles.
