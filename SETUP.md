# Team Setup and Claude Code Workflow

## 1. Install (every teammate)
- Git + **Git LFS** (`git lfs install` once)
- **Node.js 22.13+** (24 LTS recommended) for the app and the dashboard; the app tests use `node:sqlite`
- **Python 3.12** + **uv** (the backend)
- **Claude Code**: follow https://code.claude.com/docs/en/overview
- Android phone, Android 10+, with Developer Options + USB debugging. Install **Expo Go** for
  day-to-day work. No ARCore requirement and no headset: overlays are drawn over the camera feed
  and anchored to device orientation, so any Android 10+ camera phone runs the drills.
- Keep one phone you can deny camera permission on, to exercise tabletop mode.

### First clone
- Run `git lfs install` once, then `git clone <repo-url> suraksha-saathi`. Check binaries arrived:
  in `git lfs ls-files`, `*` means a real file and `-` means a pointer (fix with `git lfs pull`).
- Line endings are fixed by `.gitattributes`: every text file is LF on every OS. Do not change
  `core.autocrlf`. A "CRLF will be replaced by LF" warning is that normalization working.

## 2. Run the app on a phone
```
cd mobile
npm install
npx expo start          # scan the QR with Expo Go, same Wi-Fi
```
Anything needing a native module that Expo Go does not carry needs a dev build
(`npx eas-cli@latest build -p android --profile development`).

Build an installable APK (human: needs an expo.dev login):
```
npx eas-cli@latest login                                   # interactive, once per machine
cd mobile && git lfs pull
npx eas-cli@latest build -p android --profile preview
```
`git lfs pull` first is not optional: EAS uploads your working tree, and LFS pointer files would
ship as broken assets. The build runs in Expo's cloud and prints a download link when it finishes.

## 3. First Claude Code session (repo root)
```
claude
/context        # confirm CLAUDE.md is listed under Memory files
/implement-task T-01
```

## 4. How we get high-quality output from Claude Code
- **One task per session.** Run `/clear` between tasks so old context does not leak in.
- **Always through `/implement-task T-XX`.** It forces: read spec, plan, tests, review, tick.
- **Plan before code.** Approve the plan; push back on anything not in the spec.
- **Specs are the steering wheel.** If Claude produces something wrong because the spec was vague,
  fix the spec in `docs/`, not only the code. Everyone's next session benefits.
- **Same mistake twice = CLAUDE.md edit.** Add one concrete line to the right CLAUDE.md or rule file.
- **Tests are the proof.** Don't accept "should work". App: `cd mobile && npm test`;
  backend: `uv run pytest -q`; dashboard: `npm run test`.
- **Device truth beats laptop truth.** Camera, sensor and overlay work is only done after it runs
  on a real phone.
- **Review is automatic.** `spec-reviewer` runs at the end of every task; `crypto-reviewer` on signature code.

## 5. Parallel work without conflicts (6 people)
| Owner | Area | Owns these folders |
|---|---|---|
| A | Architecture, core logic, persistence, sync | `mobile/src/core/`, `mobile/src/db/`, `mobile/src/net/` |
| B | Camera interactions, ScenarioPlayer, overlays | `mobile/src/training/` |
| C | Screens, localization tooling | `mobile/src/app/`, `mobile/src/ui/`, `mobile/src/i18n/` |
| D | Backend + deploy | `backend/` |
| E | Dashboard + deploy | `dashboard/` |
| F | Scenario content, strings, audio, device QA, README, video | `content/`, `mobile/assets/` |
- Branch per task: `t-22-scenario-player`. Small PRs; merge daily.
- Don't edit a folder you don't own without telling its owner; `mobile/src/core/` is shared, so
  changes there need a heads-up because every area depends on it.

## 6. Secrets and environment
Backend `.env` (never committed; template in `backend/.env.example`):
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `ROOT_SIGNING_KEY_B64`, `CORS_ORIGINS`.
Dashboard `.env.local`: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Generate the root key once (`uv run python -m app.tools.gen_root_key`), store the private key in
Render env vars, commit only the public key to `content/trust/root_public_key.txt`.

## 7. Things a human must do (Claude cannot)
- Sign in to expo.dev, create the Android keystore (EAS offers to generate one), and install APKs on phones.
- Test camera and sensor behaviour on real phones; print the exit markers; record narration audio;
  get the safety-content review.
- Record third-party asset licenses in the README credits as assets are added.

## 8. Deploy the backend to Render (human, once; task T-58)
Claude can't do this: it needs your Render and Supabase accounts and the real root key (D-014).
1. **Root key (T-17).** In your own terminal: `cd backend && uv run python -m app.tools.gen_root_key`.
   Commit the changed `content/trust/root_public_key.txt`; keep the printed `ROOT_SIGNING_KEY_B64` for step 3 only.
2. **Supabase.** Create a project. Under Authentication > JWT signing keys, make sure asymmetric keys are
   in use (D-020). Copy the Connect > **Session pooler** URI (IPv4; Render has no IPv6) and add
   `?sslmode=require`.
3. **Render.** Dashboard > New > **Blueprint** > this repo (`render.yaml` at the root). Fill in the
   prompted values: `DATABASE_URL`, `ROOT_SIGNING_KEY_B64`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`
   (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), `CORS_ORIGINS`. For the demo database, set
   `SEED_DEMO_ON_START=true` on the first deploy (the seed refuses to run twice, so leaving it on is safe).
   Each start runs `alembic upgrade head`.
4. **Check.** `https://<service>.onrender.com/v1/health` -> `{"status":"ok"}`;
   `/v1/content/manifest` and `/v1/revocations` answer (both need the DB and the root key).
5. **Dashboard admins.** Create a user in Supabase Auth, then add their uid to `admin_profiles`
   (SQL editor: `insert into admin_profiles (user_id, role, site_ids) values ('<uid>', 'admin', '{}');`).
   Or, for a local seed: `uv run python -m app.tools.seed_demo --admin <uid>`.
The free plan sleeps when idle: open `/v1/health` a minute before a demo.
