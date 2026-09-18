# 07 — Localization (English, Hindi, Santali)

## Locales
| Code | Language | Script | Picker label |
|---|---|---|---|
| `en` | English | Latin | English |
| `hi` | Hindi | Devanagari | हिन्दी |
| `sat` | Santali | Devanagari (as used in Jharkhand) | संताली — label needs native-speaker confirmation |
Default locale on first launch: `hi`. Worker profile stores `preferred_lang`; kiosk switches to it at login.

## Rendering
- UI Toolkit only, Advanced Text Generator enabled in Project Settings > UI Toolkit.
- Fonts: Noto Sans Devanagari + Noto Sans (both OFL), imported as **dynamic** font assets.
- Acceptance check: the strings `क्षमता`, `ज्ञान`, `प्रशिक्षण`, `सुरक्षित` render with correct conjuncts and vowel signs on device.

## Key naming
`<area>.<item>.<kind>` — lowercase, dots, snake_case parts.
- Screens: `home.start_training.button`, `verify.status.valid`, `settings.sync_now.button`
- Scenarios: `<scenarioLower>.<stepId>.instruction`, `<scenarioLower>.<stepId>.audio`,
  `<scenarioLower>.<stepId>.option.<optionId>`, `<scenarioLower>.rule.<rule_snake>`
  e.g. `fire01.pick_extinguisher.option.dcp`, `gas01.rule.no_ignition`

## Tables (Unity Localization)
| String table | Contents |
|---|---|
| `UI` | All screen text, buttons, statuses, errors |
| `Scenario_FIRE_01` | title, step instructions, options, rule feedback |
| `Scenario_GAS_01` | same for gas |
| Asset table `Narration` | AudioClip per `*.audio` key per locale |

Source of truth for strings during development: `content/strings/<table>.csv` with columns
`key,en,hi,sat,needsReview,notes`. An Editor script imports CSV -> Unity tables. Never edit tables by hand.
`*.audio` rows hold the narration script (what the recording says; may differ from the caption in
`*.instruction`). Recorded clips use the same key in the `Narration` asset table.

## Translation workflow
1. Write `en` (short sentences, ≤ 12 words, concrete verbs, no idioms).
2. Draft `hi` (team member fluent in Hindi; machine draft allowed, then human edit).
3. Draft `sat`: machine draft (e.g., IndicTrans2 via Bhashini) may return a different script;
   convert to Devanagari and have a native Santali speaker review. Set `needsReview=false` only after review.
4. Record narration: `hi` and `sat` voiced by native speakers when possible. Temporary TTS allowed
   for `hi` during development; file names `Audio/Narration/<locale>/<key>.ogg`, mono, 22 kHz.

## Missing-content fallback (never crash, never show a raw key)
- Missing `sat` string -> show `hi` string and log key to `LocalizationReport`.
- Missing `sat` audio -> play `hi` audio, keep `sat` caption.
- Editor menu `Suraksha > Localization Report` lists missing keys/audio per locale; zero missing is a demo gate.

## Voice-first rules
- Every instruction and every result feedback row has audio. A replay button sits on every step card.
- Icons accompany every option; text is a caption, not the only cue.
