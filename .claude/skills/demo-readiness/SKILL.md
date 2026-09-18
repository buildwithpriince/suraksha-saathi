---
name: demo-readiness
description: Audit the repo against the SIH judge checklist and demo script before recording or submitting. Invoke as /demo-readiness.
disable-model-invocation: true
context: fork
---

Audit readiness for the SIH PS 26041 submission. Do not modify code.

For each item R1–R8 and D1–D5 in `docs/00-PRD.md`:
- Find the implementing code (paths), the tests that cover it, and whether `docs/TASKS.md` marks it done.
- Rate: ✅ ready / ⚠️ partial (say what is missing) / ❌ missing.

Also check:
- All test commands in root CLAUDE.md pass (run them; report failures).
- `content/scenarios/*.json` have `needsReview: false` for FIRE_01 and GAS_01; strings CSVs have no empty `hi`/`sat` cells for those scenarios.
- `content/trust/root_public_key.txt` is a real key, not the placeholder.
- README has setup steps, architecture, demo video link, and roadmap.
- `docs/09-DEMO-SCRIPT.md` setup checklist items that can be verified from the repo.

Output a table (item, status, evidence, next action) followed by a **Top 5 blockers** list in priority order.
