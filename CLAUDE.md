# Suraksha Saathi — AR safety training & certification (SIH 2026, PS 26041)

Team Caffeine Coders. Monorepo for a hackathon prototype judged against a fixed checklist.
Read `docs/00-PRD.md` once per new task area; it defines what "done" means.

## What we are building (one paragraph)
An offline-first Android app (Unity + AR Foundation/ARCore) that trains industrial workers in
Jharkhand through AR safety drills overlaid on their real surroundings, scores what they *do*
(not quiz answers), and issues a signed QR certificate that can be verified with no network.
A FastAPI backend syncs data and signs device attestations; a React dashboard shows compliance.

## Judge checklist (the PS "Expected Solution") — never regress these
1. Android APK, Android 10+, mid-range phone, no headset
2. At least 2 complete AR modules: Fire & Explosion (`FIRE_01`), Gas Leak & Confined Space (`GAS_01`)
3. Assessment engine
4. QR certificate generation AND verification
5. Hindi + Santali localisation
6. Offline functionality
7. Web admin compliance dashboard
8. Demo video + public GitHub repo
If a change risks any item above, stop and say so before continuing.

## Repo map
- `app-unity/` — Unity 6.3 LTS project (see `app-unity/CLAUDE.md`)
- `backend/` — FastAPI + PostgreSQL (Supabase) (see `backend/CLAUDE.md`)
- `dashboard/` — React + Vite + TypeScript (see `dashboard/CLAUDE.md`)
- `content/scenarios/` — scenario JSON files; the single source of truth for module steps
- `docs/` — specs. Source of truth for behaviour and data contracts

## Spec index (read the relevant one BEFORE writing code in that area)
| Area | Spec |
|---|---|
| Scope, acceptance criteria | `docs/00-PRD.md` |
| System design, offline model | `docs/01-ARCHITECTURE.md` |
| AR module flows | `docs/02-AR-MODULES.md` |
| Scoring rules | `docs/03-ASSESSMENT-ENGINE.md` |
| QR certificate format + crypto | `docs/04-CERTIFICATES.md` |
| Local DB, server DB, sync | `docs/05-DATA-AND-SYNC.md` |
| REST API | `docs/06-API.md` |
| Hindi/Santali, fonts, audio | `docs/07-LOCALIZATION.md` |
| Dashboard screens | `docs/08-DASHBOARD.md` |
| Demo video storyboard | `docs/09-DEMO-SCRIPT.md` |
| Task board | `docs/TASKS.md` |
| Decisions log | `docs/DECISIONS.md` |

## How to work in this repo
- Work one task from `docs/TASKS.md` at a time (use `/implement-task T-XX`).
- Start any task touching more than 2 files in plan mode; show the plan before editing.
- Specs win over your assumptions. If code and spec disagree, or the spec is silent or
  ambiguous, ask — do not invent a contract. When a decision is made, append it to `docs/DECISIONS.md`.
- Changing a data contract (scenario JSON, QR format, API shape, DB schema) means updating the
  spec file in the same change, and every consumer (Unity, backend, dashboard) in the same task or a
  follow-up task added to `docs/TASKS.md`.
- Finish a task by: running that area's tests, ticking the task in `docs/TASKS.md`, and giving a
  3-line summary (what changed, how it was verified, what is left).
- Small commits, one task per commit: `T-XX: short imperative summary`.

## Hard rules
- Never hand-edit Unity YAML (`*.unity`, `*.prefab`, `*.asset`, `*.meta`, `ProjectSettings/`).
  Use the Unity MCP tools or tell the human the exact Editor steps. A hook blocks these edits.
- Never read, print, or commit secrets: `.env*`, `*.pem`, `keys/`. Root signing private key lives
  only in the backend environment.
- All user-facing app text goes through localization keys. No hard-coded strings in UI.
- App UI uses UI Toolkit with the Advanced Text Generator. Never TextMeshPro (breaks Devanagari).
- Safety procedure content (steps, thresholds, PPE) only comes from `content/scenarios/*.json`.
  Do not invent safety facts in code or strings; mark unknowns `"needsReview": true`.
- Everything the worker does must work in airplane mode. Network is only for sync.

## Commands (quick reference; details in each sub-CLAUDE.md)
- Core C# tests (fast, no Editor): `dotnet test app-unity/CoreTests~`
- Backend tests: `cd backend && uv run pytest -q`
- Dashboard: `cd dashboard && npm run typecheck && npm run test && npm run build`
- Validate scenario JSON: `cd backend && uv run python -m app.tools.validate_scenarios ../content/scenarios`
