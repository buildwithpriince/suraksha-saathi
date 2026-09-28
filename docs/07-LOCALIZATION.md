# 07 — Localization (English, Hindi, Santali)

## Locales
| Code | Language | Script | Picker label |
|---|---|---|---|
| `en` | English | Latin | English |
| `hi` | Hindi | Devanagari | हिन्दी |
| `sat` | Santali | Devanagari (as used in Jharkhand) | संताली — label needs native-speaker confirmation |
Default locale on first launch: `hi`. Worker profile stores `preferred_lang`; kiosk switches to it at login.

## Rendering
- All app text renders through `Text` / `TextInput` from `@/ui/Text`, never react-native's own,
  so every phone shows the same shaping (D-032).
- Fonts: Noto Sans Devanagari + Noto Sans (both OFL), bundled with `expo-font` and loaded in the
  root layout. Runtime-loaded fonts get one family name per weight, so `ui/Text` picks the face
  from `fontWeight` rather than letting Android fake-bold it.
- Acceptance check: the strings `क्षमता`, `ज्ञान`, `प्रशिक्षण`, `सुरक्षित` render with correct conjuncts and vowel signs on device.

## Key naming
`<area>.<item>.<kind>` — lowercase, dots, snake_case parts.
- Screens: `home.start_training.button`, `verify.status.valid`, `settings.sync_now.button`
- Scenarios: `<scenarioLower>.<stepId>.instruction`, `<scenarioLower>.<stepId>.audio`,
  `<scenarioLower>.<stepId>.option.<optionId>`, `<scenarioLower>.rule.<rule_snake>`
  e.g. `fire01.pick_extinguisher.option.dcp`, `gas01.rule.no_ignition`

## Tables (i18next)
| CSV table | Contents |
|---|---|
| `UI` | All screen text, buttons, statuses, errors |
| `Scenario_FIRE_01` | title, step instructions, options, rule feedback |
| `Scenario_GAS_01` | same for gas |
| `Narration` | The narration script per `*.audio` key; the recorded clip uses the same key |

Source of truth for strings: `content/strings/<table>.csv` with columns
`key,en,hi,sat,needsReview,notes`. `npm run l10n:build` flattens every CSV into one JSON file per
locale in `mobile/src/i18n/generated/` (`en.json`, `hi.json`, `sat.json`), which is committed
because EAS skips gitignored files. Never hand-edit the generated JSON.
`*.audio` rows hold the narration script (what the recording says; may differ from the caption in
`*.instruction`).

## Translation workflow
1. Write `en` (short sentences, ≤ 12 words, concrete verbs, no idioms).
2. Draft `hi` (team member fluent in Hindi; machine draft allowed, then human edit).
3. Draft `sat`: machine draft (e.g., IndicTrans2 via Bhashini) may return a different script;
   convert to Devanagari and have a native Santali speaker review. Set `needsReview=false` only after review.
4. Record narration: `hi` and `sat` voiced by native speakers when possible. Temporary TTS allowed
   for `hi` during development; file names `mobile/assets/narration/<locale>/<key>.ogg` (Git LFS),
   mono, 22 kHz, played with `expo-audio`.

## Missing-content fallback (never crash, never show a raw key)
- Missing `sat` string -> i18next falls back to the `hi` string, never a raw key.
- Missing `sat` audio -> play `hi` audio, keep `sat` caption.
- `npm run l10n:report` lists missing keys and narration audio per locale; zero missing is a demo gate.

## Voice-first rules
- Every instruction and every result feedback row has audio. A replay button sits on every step card.
- Icons accompany every option; text is a caption, not the only cue.
