# Strings
One CSV per string table: `UI.csv`, `Scenario_FIRE_01.csv`, `Scenario_GAS_01.csv`.
Columns: `key,en,hi,sat,needsReview,notes`. UTF-8, no BOM. See `docs/07-LOCALIZATION.md`.
`santali-review.csv` is not a table: it is the sheet for a native Santali speaker, written by
`npm run l10n:export-review` and read back by `npm run l10n:import-review` (docs/07, D-047).
Santali is written in Ol Chiki.
