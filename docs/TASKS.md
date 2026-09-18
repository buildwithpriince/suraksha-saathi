# Task Board

Format: `- [ ] T-XX [owner] Title — Done when: ... (deps: T-YY)`
Owners: **A** Unity lead/architecture · **B** AR interactions · **C** Unity UI + localization ·
**D** Backend · **E** Dashboard · **F** Content, QA, demo video. Replace letters with names.
Rules: one task = one branch = one commit/PR. Only the owner of a scene edits that scene.
Fill in dates for each milestone once the finale date is known.

## M0 — Foundations (target: ____)
- [ ] T-01 [A] Monorepo init: `.gitignore` (Unity/Python/Node), `.gitattributes` with Git LFS for binaries, README skeleton — Done when: fresh clone opens all three apps
- [ ] T-02 [A] Unity 6.3 LTS project in `app-unity/` with packages from `app-unity/CLAUDE.md`, Android target, IL2CPP ARM64, min API 29, Advanced Text Generator on — Done when: empty scene builds to a phone
- [ ] T-03 [A] Folder layout + asmdefs (Core with No Engine References, Runtime, Editor, Tests) — Done when: layout matches `app-unity/CLAUDE.md`
- [ ] T-04 [A] `CoreTests~` .NET 8 xUnit project compiling `Scripts/Core/**/*.cs` at LangVersion 9 — Done when: `dotnet test` runs 1 sample test
- [ ] T-05 [D] Backend skeleton: uv, FastAPI app factory, config, health route, ruff, pytest, docker compose Postgres — Done when: `uv run pytest` green
- [ ] T-06 [E] Dashboard skeleton: Vite React TS strict, Tailwind, Router, TanStack Query, Vitest — Done when: typecheck/test/build green
- [ ] T-07 [A] Unity MCP connected to Claude Code (see SETUP.md) — Done when: Claude can read the Boot scene hierarchy

## M1 — Core logic, no Unity APIs (target: ____)
- [ ] T-10 [A] Scenario model + JSON loader + validation (docs/02 contract) — Done when: loads both scenario files, rejects 5 malformed cases in tests
- [ ] T-11 [F] Author `content/scenarios/FIRE_01.json` and `GAS_01.json` from docs/02 via `/new-scenario` — Done when: validator passes, rule points sum to 100
- [ ] T-12 [A] Assessment engine + the 13 required tests in docs/03 — Done when: all 13 pass (deps: T-10, T-11)
- [ ] T-13 [A] Token codec + Ed25519 sign/verify in Core (BouncyCastle) — Done when: V1–V4 vectors pass (docs/04)
- [ ] T-14 [D] Python crypto module + same V1–V4 vectors + `gen_root_key.py` — Done when: vectors pass
- [ ] T-15 [E] `lib/cert` in TS + V1–V4 vectors — Done when: vectors pass
- [ ] T-16 [D] `validate_scenarios.py` tool (same checks as T-10) — Done when: CLI passes on both files

## M2 — FIRE_01 playable (target: ____)
- [ ] T-20 [A] Boot scene: AR availability check -> route to ARTraining or TabletopTraining; DB migration stub
- [ ] T-21 [B] ARTraining scene: session, plane manager, raycast placement (`place_on_plane`)
- [ ] T-22 [B] ScenarioPlayer: plays steps from JSON, writes events, calls engine at end (deps: T-12)
- [ ] T-23 [B] Interactions: `tap_target`, `choose_one`, `decision`, `narration`
- [ ] T-24 [B] Interactions: `aim_and_hold` (reticle, base-vs-top zones), `move_to` (+ exitBehind check)
- [ ] T-25 [B] Image tracking `find_marker` with EXIT_A/EXIT_B library + AR route arrows to marker
- [ ] T-26 [C] Result screen per docs/03 (sorted rules, tap-to-hear feedback, try again)
- [ ] T-27 [B] Fire VFX (particle, lightweight) + escalation spread; 30 fps on target phone
- [ ] T-28 [F] Device test: full FIRE_01 run on 2 phones, bug list filed as tasks

## M3 — GAS_01 + fallback (target: ____)
- [ ] T-30 [B] Interactions: `choose_many`, `checklist`, `mark_zone`; gas cloud + detector reading by distance
- [ ] T-31 [B] GAS_01 fully playable in AR, both variants
- [ ] T-32 [A] TabletopTraining scene: virtual room, touch camera, fallback implementations of all interaction types
- [ ] T-33 [F] Device test GAS_01 + tabletop run of both modules

## M4 — Worker journey, persistence, certificates (target: ____)
- [ ] T-40 [A] SQLite layer + repositories + outbox-in-same-transaction (docs/05)
- [ ] T-41 [C] Screens: device setup, home, kiosk login (scan worker ID QR / pick), enrol worker, module list, settings
- [ ] T-42 [A] Certificate issuance flow + QR render (docs/04 issuance)
- [ ] T-43 [C] Verify scene: camera QR scan (ZXing) + status card + revocation freshness line
- [ ] T-44 [F] Airplane-mode test of full journey — Done when: zero network calls needed, no crashes

## M5 — Backend (target: ____)
- [ ] T-50 [D] Models + Alembic migration for docs/05 server tables
- [ ] T-51 [D] Device register, admin approve (attestation signing), attestation status
- [ ] T-52 [D] Device signed-request auth dependency + tests (bad sig, stale timestamp, pending device)
- [ ] T-53 [D] `POST /v1/sync` ingest with idempotency, flagging, certificate verification + tests
- [ ] T-54 [D] Revocations (SR1 generation on revoke), content manifest, public verify
- [ ] T-55 [D] Admin endpoints (docs/06 table) with supervisor site scoping + tests
- [ ] T-56 [D] `seed_demo.py` per docs/08; deploy to Render
- [ ] T-57 [A] Unity sync client (signed headers, backoff) against deployed backend (deps: T-40, T-53)

## M6 — Dashboard (target: ____)
- [ ] T-60 [E] Auth + layout + protected routes
- [ ] T-61 [E] Overview + Compliance heatmap
- [ ] T-62 [E] Workers, worker detail, attempts, attempt detail
- [ ] T-63 [E] Certificates (revoke), Recertification (CSV), Devices (approve)
- [ ] T-64 [E] Public `/verify` (camera scan, offline check, online status); deploy to Vercel

## M7 — Localization + audio (target: ____)
- [ ] T-70 [C] CSV -> Unity Localization importer + Localization Report menu (docs/07)
- [ ] T-71 [F] `content/strings/*.csv` complete in en/hi; sat drafted
- [ ] T-72 [F] Santali native-speaker review; `needsReview` cleared for demo scenarios
- [ ] T-73 [F] Narration audio recorded/imported for hi and sat; report shows zero missing

## M8 — Ship (target: ____)
- [ ] T-80 [A] Release APK signed; install test on 2 phones; size < 150 MB
- [ ] T-81 [F] README: problem, features, architecture diagram, setup, screenshots, roadmap, team
- [ ] T-82 [F] Record demo video per docs/09; upload; link in README
- [ ] T-83 [all] `/demo-readiness` passes with no blockers; repo made public
