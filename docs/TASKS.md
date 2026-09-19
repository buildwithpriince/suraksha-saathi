# Task Board

Format: `- [ ] T-XX [owner] Title — Done when: ... (deps: T-YY)`
Owners: **A** App lead/architecture · **B** Camera interactions · **C** App UI + localization ·
**D** Backend · **E** Dashboard · **F** Content, QA, demo video. Replace letters with names.
Rules: one task = one branch = one commit/PR. Only the owner of a screen or interaction edits it.
Fill in dates for each milestone once the finale date is known.
The app is Expo React Native in `mobile/` (D-027); app tasks below were rewritten from the Unity plan.

## M0 — Foundations (target: ____)
- [x] T-01 [A] Monorepo init: `.gitignore` (Unity/Python/Node), `.gitattributes` with Git LFS for binaries, README skeleton — Done when: fresh clone opens all three apps
- [ ] T-02 [A] Expo app in `mobile/` per `mobile/CLAUDE.md`: TypeScript strict, expo-router, Android package id, minSdk 29 (`expo-build-properties`), `eas.json` with a `preview` profile that builds an APK, `.gitignore` for `android/` `ios/` `.expo/` — Done when: the starter screen runs on a phone via `npx expo start` and `eas build -p android --profile preview` produces an APK that installs (human: expo.dev login)
- [ ] T-03 [A] Folder layout from `mobile/CLAUDE.md` + ESLint with `no-restricted-imports` keeping `src/core` free of react / react-native / expo — Done when: layout matches, `npm run lint` and `npm run typecheck` green, an RN import in `src/core` fails lint (deps: T-02)
- [x] T-04 [A] Vitest for `src/core` (`npm test`) — Done when: `npm test` runs 1 sample test (deps: T-03)
- [x] T-05 [D] Backend skeleton: uv, FastAPI app factory, config, health route, ruff, pytest, docker compose Postgres — Done when: `uv run pytest` green
- [x] T-06 [E] Dashboard skeleton: Vite React TS strict, Tailwind, Router, TanStack Query, Vitest — Done when: typecheck/test/build green
- ~~T-07 [A] Unity MCP connected to Claude Code~~ — dropped: no Unity Editor (D-027)
- [ ] T-08 [A] Bundle `/content` into the app: Metro `watchFolders` + JSON imports of `content/scenarios/*.json` and `content/manifest.json`, and a build script that turns `content/trust/root_public_key.txt` into a TS module (Metro has no `?raw`); replaces the Unity copy step and D-009 — Done when: an APK in airplane mode loads both scenarios and the committed root key (deps: T-02)
- [ ] T-09 [A] Rewrite the Unity-era specs for the Expo app (D-027): docs/00 (R2/R2a wording, D3 as QR markers), docs/01 (component diagram, screens instead of scenes), docs/02 (camera-mode behaviour column per `mobile/CLAUDE.md`, QR markers), docs/03 (TS core path), docs/04 (implementations line), docs/05 (device key in secure store), docs/07 (rendering, i18next tables, report script), docs/09, README, SETUP — Done when: no spec or setup doc mentions Unity, C# Core or ARCore except as history, and `spec-reviewer` finds no contradiction with `mobile/CLAUDE.md`

## M1 — Core logic, pure TypeScript (target: ____)
- [x] T-10 [A] Scenario model + JSON loader + validation in `mobile/src/core/scenarios` (docs/02 contract) — Done when: loads both scenario files, rejects 5 malformed cases in tests (deps: T-04)
- [x] T-11 [F] Author `content/scenarios/FIRE_01.json` and `GAS_01.json` from docs/02 via `/new-scenario` — Done when: validator passes, rule points sum to 100
- [x] T-12 [A] Assessment engine in `mobile/src/core/assessment` + the 13 required tests in docs/03. Pin in docs/03 first (agreed 2026-09-18): `hold` reads each `hold_progress` as one 0.25 s sample, onTarget = max `onTargetSec` in the step, offTargetRatio = samples in `offTargetZones` / all samples in the step; earned points are integers ("half" = floor(points / 2)); scorePercent in integer math, half away from zero (D-022) — Done when: all 13 pass (deps: T-10, T-11)
- [ ] T-13 [A] Token codec + Ed25519 sign/verify in `mobile/src/core/certificates`, ported from `dashboard/src/lib/cert` (`@noble/ed25519` sync API with `@noble/hashes` sha512, `zip215: false`, prime-order `dpk`, strict UTF-8/JSON) — Done when: V1–V4 vectors pass under Vitest and V1 verifies on a phone (Hermes) (deps: T-04)
- [x] T-14 [D] Python crypto module + same V1–V4 vectors + `gen_root_key.py` — Done when: vectors pass
- [x] T-15 [E] `lib/cert` in TS + V1–V4 vectors — Done when: vectors pass
- [ ] T-16 [D] `validate_scenarios.py` tool (same checks as T-10) — Done when: CLI passes on both files
- [ ] T-17 [D] Human step: run `uv run python -m app.tools.gen_root_key` in your own terminal, set the printed `ROOT_SIGNING_KEY_B64` in Render, commit `content/trust/root_public_key.txt` (D-014) — Done when: the file holds a 43-char key and Render has the secret (deps: T-14)
- [ ] T-18 [D] Pin the remaining cross-language token rules in docs/04 before T-13 (from the T-14 crypto review): integers as JSON integers 0..2^53−1 without fraction/exponent; duplicate keys; whitespace around scanned tokens; lowercase UUIDs for `cid`; which content limits verifiers enforce (`wn` ≤ 24, score range, required modules); RFC 8032 cofactorless verify and prime-order key checks in TS (noble `zip215: false`, app and dashboard). Add shared negative vectors to `content/trust/test-vectors.json` (non-canonical/padded segment, 63-byte signature, float `iat`, BOM body, bad `att`, small-order `dpk`, forged SR1) — Done when: docs/04 lists the rules and Python passes the new vectors; app and dashboard pick them up in a follow-up (deps: T-14)

## M2 — FIRE_01 playable (target: ____)
- [x] T-20 [A] Boot: camera permission -> `ar` mode, denied/no camera -> `tabletop`; SQLite migration stub; locale load; route to setup or home (deps: T-03)
- [x] T-21 [B] Camera training screen: `expo-camera` feed, overlay layer anchored to device orientation (`expo-sensors`, 3DoF), tap-to-place (`place_on_plane`) (deps: T-20)
- [x] T-22 [B] ScenarioPlayer: plays steps from JSON, writes events with the monotonic clock, calls the engine at the end (deps: T-12, T-21)
- [x] T-23 [B] Interactions: `tap_target`, `choose_one`, `decision`, `narration`
- [x] T-24 [B] Interactions: `aim_and_hold` (screen-centre reticle on anchored base-vs-top zones, 0.25 s samples per T-12), `move_to` (waypoint taps for scene anchors; walk-and-scan for marker anchors; `exitBehind` from compass heading)
- [x] T-25 [B] `find_marker` by QR scanning of printed `EXIT_A`/`EXIT_B` markers + a script that generates the printable A5 marker PDFs + on-screen route arrow by heading
- [x] T-26 [C] Result screen per docs/03 (sorted rules, tap-to-hear feedback, try again)
- [ ] T-27 [B] Fire overlay (animated 2D, Reanimated/SVG) + escalation spread; 30 fps on target phone
- [ ] T-28 [F] Device test: full FIRE_01 run on 2 phones, bug list filed as tasks

## M3 — GAS_01 + fallback (target: ____)
- [ ] T-30 [B] Interactions: `choose_many`, `checklist`, `mark_zone` (cones on the placed overlay, radius in overlay metres); gas cloud overlay + detector reading by waypoint progress
- [ ] T-31 [B] GAS_01 fully playable in camera mode, both variants
- [ ] T-32 [A] Tabletop mode: drawn virtual room instead of the camera feed, touch-only versions of all interaction types, same player and scoring
- [ ] T-33 [F] Device test GAS_01 + tabletop run of both modules

## M4 — Worker journey, persistence, certificates (target: ____)
- [x] T-40 [A] `expo-sqlite` layer + repositories + outbox-in-same-transaction (docs/05); device key pair generated on first launch, private key in `expo-secure-store` (supersedes D-004's package choice)
- [ ] T-41 [C] Screens: device setup, home, kiosk login (scan worker ID QR / pick), enrol worker, module list, settings
- [x] T-42 [A] Certificate issuance flow + QR render (`react-native-qrcode-svg`, error correction M; docs/04 issuance) (deps: T-13, T-40)
- [x] T-43 [C] Verify screen: `expo-camera` QR scan + status card + revocation freshness line (deps: T-13)
- [ ] T-44 [F] Airplane-mode test of full journey — Done when: zero network calls needed, no crashes

## M5 — Backend (target: ____)
- [x] T-50 [D] Models + Alembic migration for docs/05 server tables
- [x] T-51 [D] Device register, admin approve (attestation signing), attestation status (the status route shipped with T-52's auth)
- [x] T-52 [D] Device signed-request auth dependency + tests (bad sig, stale timestamp, pending device)
- [x] T-53 [D] `POST /v1/sync` ingest with idempotency, flagging, certificate verification + tests
- [x] T-54 [D] Revocations (SR1 generation on revoke), content manifest, public verify
- [x] T-55 [D] Admin endpoints (docs/06 table) with supervisor site scoping + tests
- [ ] T-56 [D] `seed_demo.py` per docs/08; deploy to Render — seed_demo + `render.yaml` done and smoke-tested locally; the live deploy waits on T-58
- [ ] T-58 [D] Human step: Supabase project + Render Blueprint per SETUP.md section 8 (root key, DB URL, JWKS, CORS; `SEED_DEMO_ON_START=true` once) — Done when: `https://<service>.onrender.com/v1/health` is ok and `/v1/revocations` returns an SR1 (deps: T-17)
- [ ] T-59 [D] Run `uv run pytest` once against `docker compose` Postgres (the suite has only run on SQLite, D-019); fix any dialect differences — Done when: green on Postgres 17
- [ ] T-57 [A] App sync client (`fetch`, signed headers per docs/05, backoff) against deployed backend (deps: T-40, T-53)

## M6 — Dashboard (target: ____)
- [x] T-60 [E] Auth + layout + protected routes
- [x] T-61 [E] Overview + Compliance heatmap
- [x] T-62 [E] Workers, worker detail, attempts, attempt detail
- [x] T-63 [E] Certificates (revoke), Recertification (CSV), Devices (approve)
- [ ] T-64 [E] Public `/verify` (camera scan, offline check, online status); deploy to Vercel — page, root `vercel.json` and tests done; the first deploy waits on a Vercel login (`npx vercel --prod` from the repo root)

## M7 — Localization + audio (target: ____)
- [ ] T-70 [C] `npm run l10n:build` (content/strings CSV -> i18next JSON, `sat` falls back to `hi`) + `npm run l10n:report` (missing keys and narration audio per locale) (docs/07)
- [ ] T-71 [F] `content/strings/*.csv` complete in en/hi; sat drafted
- [ ] T-72 [F] Santali native-speaker review; `needsReview` cleared for demo scenarios
- [ ] T-73 [F] Narration audio recorded and bundled for hi and sat; report shows zero missing

## M8 — Ship (target: ____)
- [ ] T-80 [A] Release APK via EAS (signed); install test on 2 phones; size < 150 MB
- [ ] T-81 [F] README: problem, features, architecture diagram, setup, screenshots, roadmap, team
- [ ] T-82 [F] Record demo video per docs/09; upload; link in README
- [ ] T-83 [all] `/demo-readiness` passes with no blockers; repo made public
- [ ] T-84 [A] After the demo: move the certificate code into one package shared by `mobile/` and `dashboard/` (D-027 copied it) — Done when: both apps import it and both vector suites pass
