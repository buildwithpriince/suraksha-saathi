# Decisions Log

Format: `D-XXX — Title (date) — Decision. Why. Alternatives rejected.` Append only; supersede, don't edit.

- **D-001 — Unity + AR Foundation for the app.** PS requires an APK with AR overlaid on real surroundings; needs ARCore plane detection and image tracking. WebAR rejected (no reliable plane AR on low-end Android, not an APK). React Native AR rejected (thin ecosystem, risky under time pressure).
- **D-002 — UI Toolkit with Advanced Text Generator, not TextMeshPro.** TMP does not shape Devanagari conjuncts/matras correctly; ATG uses HarfBuzz/ICU. Hindi and Santali are judged requirements.
- **D-003 — Scenario steps are data.** One generic ScenarioPlayer + JSON content lets us add modules without code, keeps safety content reviewable by non-programmers, and lets the engine be unit-tested.
- **D-004 — Local storage: SQLite.** Needed for transactional outbox. Candidate package: `gilzoide/unity-sqlite-net` (UPM, Android support). Fallback if it blocks us for > 2 hours: JSON files with atomic write + in-memory outbox index. Confirm in T-40 and record the outcome here.
- **D-005 — Two-level signature chain (root -> device attestation -> certificate).** Enables issuance AND verification with no network, which is a promised differentiator. Plain signed URL rejected (fails offline). Blockchain rejected (unnecessary; judges may see it as a buzzword).
- **D-006 — JWS-style compact tokens; verify over transmitted bytes.** Avoids cross-language JSON canonicalization bugs between C#, Python and TypeScript.
- **D-007 — Core C# tested with `dotnet test` outside Unity.** Fast feedback loop for Claude Code; Unity batchmode tests are slow and blocked when the Editor is open.
- **D-008 — Backend: FastAPI + Supabase Postgres on Render; dashboard on Vercel.** Matches team experience and the PPT.
