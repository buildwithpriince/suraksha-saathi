# 07 — Localization (English, Hindi, Santali)

## Locales
| Code | Language | Script | Picker label |
|---|---|---|---|
| `en` | English | Latin | English |
| `hi` | Hindi | Devanagari | हिन्दी |
| `sat` | Santali | Ol Chiki (D-047) | ᱥᱟᱱᱛᱟᱲᱤ (Santali) — shown in every language; needs native-speaker confirmation |
Default locale on first launch: `hi`. Worker profile stores `preferred_lang`; kiosk switches to it at login.

## Rendering
- All app text renders through `Text` / `TextInput` from `@/ui/Text`, never react-native's own,
  so every phone shows the same shaping (D-032).
- Fonts (all OFL), bundled with `expo-font` and loaded in the root layout: Noto Sans Devanagari
  (en and hi; it has Latin) and Noto Sans Ol Chiki 400/600/700 (sat; it has Latin, digits and
  common punctuation, no 800). `ui/Text` picks the family by the text: any Ol Chiki character ->
  Ol Chiki, otherwise Devanagari; nested elements go by the locale. Stack header titles pick by
  locale in the root layout. Runtime-loaded fonts get one family name per weight, so `ui/Text`
  picks the face from `fontWeight` rather than letting Android fake-bold it.
- Santali keeps Latin digits (interpolated numbers are Latin) and ends sentences with ᱾ (mucaad).
  Safety equipment terms without a settled Santali word stay in English inside the Santali sentence
  (extinguisher, self-rescuer, dry chemical powder, lever, nozzle, cap lamp, call point…; D-047).
- Ol Chiki runs about twice as wide as Hindi. Single-line places (stack header, `AppTitle`, overlay
  label boxes, badges) were measured against the font metrics at 320 dp; everything else wraps.
- Acceptance check: the strings `क्षमता`, `ज्ञान`, `प्रशिक्षण`, `सुरक्षित` render with correct conjuncts and vowel signs on device,
  and `ᱥᱟᱱᱛᱟᱲᱤ` renders as Ol Chiki letters, not boxes.

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
3. Draft `sat` in Ol Chiki, short and literal, with `needsReview=true`. Never set
   `needsReview=false` by hand; only the review import does.
4. Native-speaker review (D-047), from `mobile/`:
   - `npm run l10n:export-review` writes `content/strings/santali-review.csv` (UTF-8 with a BOM so
     Excel opens it correctly) with columns `key, English, Hindi, Santali draft, corrected Santali`,
     one row per `needsReview=true` string. It refuses to overwrite corrections that have not been
     imported (`npm run l10n:export-review -- --force` discards them).
   - The speaker fills `corrected Santali` where the draft is wrong, or copies the draft to approve
     it; blank cells are skipped.
   - `npm run l10n:import-review` writes each correction into the `sat` column, sets
     `needsReview=false` for that row and rebuilds the locale JSON. A correction that loses or adds a
     `{{placeholder}}`, or an unknown key, stops the import with the row number.
5. Record narration: `hi` and `sat` voiced by native speakers when possible. Temporary TTS allowed
   for `hi` during development; file names `mobile/assets/narration/<locale>/<key>.ogg` (Git LFS),
   mono, 22 kHz, played with `expo-audio`.

## Missing-content fallback (never crash, never show a raw key)
- Missing `sat` string -> i18next falls back to the `hi` string, never a raw key.
- Missing `sat` audio -> play `hi` audio, keep `sat` caption. Until recordings exist, TTS does the
  same: Android has no Santali voice and a Hindi voice can't read Ol Chiki, so `sat` speaks the `hi`
  text with the Santali caption on screen.
- While `sat` is selected, Home shows a dismissible note, in Santali and English, that the Santali
  text is a draft under native-speaker review and that narration is in Hindi. Choosing Santali again
  brings it back.
- `npm run l10n:report` lists missing keys and narration audio per locale, and how many `sat` drafts
  still await review; zero missing is a demo gate.

## Voice-first rules
- Every instruction and every result feedback row has audio. A replay button sits on every step card.
- Icons accompany every option; text is a caption, not the only cue.
