---
name: new-scenario
description: Author or update a training scenario JSON file and its localization rows from the docs/02 module tables. Use when creating or changing files in content/scenarios/.
---

Create or update the scenario named in the request (e.g. `FIRE_01`).

1. Read `docs/02-AR-MODULES.md` (contract, interaction types, the module's step and rule tables) and `docs/03-ASSESSMENT-ENGINE.md` (rule types).
2. Write `content/scenarios/<ID>.json` following the contract exactly:
   - steps in table order; `interaction` only from the allowed list; `timeLimitSec` where the rules need it
   - options with ids, `forbidden: true` and `tag` where the table marks forbidden
   - variants and variant-scoped rules (`"variants": [...]`) as in the table
   - `needsReview: true` at scenario level until a human review is recorded
3. Check: rule points sum to 100; every rule references existing step ids; every `correct` option exists.
4. Add or update `content/strings/Scenario_<ID>.csv` with every key (`key,en,hi,sat,needsReview,notes`). Fill `en`; leave `hi`/`sat` empty with `needsReview=true` unless provided.
5. Run the validator: `cd backend && uv run python -m app.tools.validate_scenarios ../content/scenarios` (if it exists yet).
6. List every safety statement you were unsure about under **Needs expert review**.
