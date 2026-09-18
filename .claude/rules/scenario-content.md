---
paths:
  - "content/**/*.json"
  - "content/strings/**/*.csv"
---

# Rules for safety content

- The contract is `docs/02-AR-MODULES.md`. Only the interaction types and rule types listed there are allowed.
- Rule `points` in a scenario must sum to 100 across all rules (variant-scoped rules included).
- Never invent safety facts, thresholds, or PPE. If the spec does not state it, add it with `"needsReview": true` and list it in your summary.
- Every step needs `instructionKey` and `audioKey`; every option and rule needs a localization key; add matching rows to `content/strings/Scenario_<ID>.csv`.
- Bump `version` when steps or rules change. Old attempts keep their version.
- After editing, run: `cd backend && uv run python -m app.tools.validate_scenarios ../content/scenarios`
