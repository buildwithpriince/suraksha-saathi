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

## Repo
| Path | What |
|---|---|
| `app-unity/` | Android app (Unity 6.3 LTS, AR Foundation) |
| `backend/` | FastAPI sync + certificate authority |
| `dashboard/` | React admin dashboard + public verify page |
| `content/` | Scenario definitions, strings, trust anchors |
| `docs/` | Specifications |

## Getting started
See `SETUP.md`.

## Roadmap
Remaining PS safety domains (Machinery and others), hardware-backed keys, DigiLocker integration.

## Team
Caffeine Coders — add names and roles.
