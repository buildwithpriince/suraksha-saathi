# Team Setup and Claude Code Workflow

## 1. Install (every teammate)
- Git + **Git LFS** (`git lfs install` once)
- Unity Hub + **Unity 6.3 LTS** with Android Build Support (OpenJDK, Android SDK & NDK)
- **.NET 8 SDK** (runs Core tests outside Unity)
- **Node.js 20+**, **Python 3.12** + **uv**
- **Claude Code**: follow https://code.claude.com/docs/en/overview
- Android phone with Developer Options + USB debugging; check it is on Google's ARCore supported
  devices list (https://developers.google.com/ar/devices). Keep one non-ARCore phone for fallback testing.

### First clone
- Run `git lfs install` once, then `git clone <repo-url> suraksha-saathi`. Check binaries arrived:
  in `git lfs ls-files`, `*` means a real file and `-` means a pointer (fix with `git lfs pull`).
- Line endings are fixed by `.gitattributes`: every text file is LF on every OS. Do not change
  `core.autocrlf`. A "CRLF will be replaced by LF" warning is that normalization working.
- Unity Smart Merge (optional, per machine, Unity users). Without it Git does a normal text merge
  of scenes/prefabs; safe, but more conflicts. Either way, only a scene's owner edits it (section 5).
  ```
  git config merge.unityyamlmerge.name "Unity SmartMerge"
  git config merge.unityyamlmerge.driver "'<UnityYAMLMerge>' merge -p %O %B %A %A"
  git config merge.unityyamlmerge.recursive binary
  ```
  `<UnityYAMLMerge>` is in the Unity install, for example
  Windows: `C:/Program Files/Unity/Hub/Editor/<version>/Editor/Data/Tools/UnityYAMLMerge.exe`,
  macOS: `/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/Tools/UnityYAMLMerge`.

## 2. Connect Claude Code to the Unity Editor (A and B at minimum)
Pick ONE and follow its own install guide, then run `/mcp` inside Claude Code to confirm it is connected.
- Official Unity MCP (part of Unity's AI tools, beta): https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.0/manual/unity-mcp-overview.html
- Community alternative (open source): https://github.com/CoderGamester/mcp-unity
Then run task T-07: ask Claude to read the Boot scene hierarchy and the Console.
If MCP is unavailable, Claude will give you numbered Editor steps instead of editing scene files (enforced by the hook).

## 3. First Claude Code session (repo root)
```
claude
/context        # confirm CLAUDE.md is listed under Memory files
/mcp            # confirm Unity MCP (if set up)
/implement-task T-01
```

## 4. How we get high-quality output from Claude Code
- **One task per session.** Run `/clear` between tasks so old context does not leak in.
- **Always through `/implement-task T-XX`.** It forces: read spec, plan, tests, review, tick.
- **Plan before code.** Approve the plan; push back on anything not in the spec.
- **Specs are the steering wheel.** If Claude produces something wrong because the spec was vague,
  fix the spec in `docs/`, not only the code. Everyone's next session benefits.
- **Same mistake twice = CLAUDE.md edit.** Add one concrete line to the right CLAUDE.md or rule file.
- **Tests are the proof.** Don't accept "should work". Core: `dotnet test`; backend: `pytest`; dashboard: `vitest`.
- **Device truth beats Editor truth.** AR work is only done after it runs on a real phone.
- **Review is automatic.** `spec-reviewer` runs at the end of every task; `crypto-reviewer` on signature code.

## 5. Parallel work without conflicts (6 people)
| Owner | Area | Owns these Unity files |
|---|---|---|
| A | Architecture, Core, persistence, sync, Boot/Tabletop scenes | `Boot.unity`, `TabletopTraining.unity` |
| B | AR interactions, ScenarioPlayer, VFX | `ARTraining.unity`, interaction prefabs |
| C | UI Toolkit screens, localization tooling, Verify scene | `Home.unity`, `Verify.unity`, `UI/` |
| D | Backend + deploy | — |
| E | Dashboard + deploy | — |
| F | Scenario content, strings, audio, device QA, README, video | `content/`, `Audio/` |
- Branch per task: `t-22-scenario-player`. Small PRs; merge daily.
- Never edit a scene or prefab you don't own; ask the owner or make a new prefab.
- Always commit `.meta` files with their assets. Close Unity before `git pull` on scene files.

## 6. Secrets and environment
Backend `.env` (never committed; template in `backend/.env.example`):
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `ROOT_SIGNING_KEY_B64`, `CORS_ORIGINS`.
Dashboard `.env.local`: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Generate the root key once (`uv run python -m app.tools.gen_root_key`), store the private key in
Render env vars, commit only the public key to `content/trust/root_public_key.txt`.

## 7. Things a human must do (Claude cannot)
- Install Unity modules, sign in to Unity, create the Android keystore, and build/install APKs.
- Test AR on real phones; print markers; record narration audio; get the safety-content review.
- Source 3D models/VFX (free or CC0) and record their licenses in README credits.

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
