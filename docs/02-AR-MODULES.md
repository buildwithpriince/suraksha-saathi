# 02 — AR Training Modules

All safety content below is DRAFT and `needsReview: true` until a mine safety officer or ITI
instructor signs off. Code must not hard-code any of it; it lives in `content/scenarios/*.json`.

## Scenario JSON contract (`content/scenarios/<ID>.json`)
```json
{
  "id": "FIRE_01",
  "version": 1,
  "domain": "fire_explosion",
  "titleKey": "fire01.title",
  "needsReview": true,
  "passThresholdPercent": 70,
  "validityDays": 365,
  "timeLimitSec": 420,
  "setup": { "requiresPlane": true, "markers": ["EXIT_A"] },
  "variants": [
    { "id": "ordinary", "params": { "fireType": "ordinary_combustibles" } },
    { "id": "oil",      "params": { "fireType": "oil" } }
  ],
  "steps": [
    {
      "id": "raise_alarm",
      "interaction": "tap_target",
      "instructionKey": "fire01.raise_alarm.instruction",
      "audioKey": "fire01.raise_alarm.audio",
      "params": { "target": "AlarmCallPoint" },
      "timeLimitSec": 20
    }
  ],
  "rules": [
    { "id": "R_ALARM_BEFORE_FIGHT", "type": "order", "params": { "before": "raise_alarm", "after": "extinguish" },
      "points": 10, "critical": true, "feedbackKey": "fire01.rule.alarm_before_fight" }
  ]
}
```
- `variant` is chosen per attempt: `variants[seed % variants.length]`; seed is stored with the attempt.
- Step `params` may reference variant params with `"$fireType"`: any string value `"$name"`, at any
  depth inside `params`, is replaced by the variant's param `name`.
- Rule types and scoring: `docs/03-ASSESSMENT-ENGINE.md`.

### Fields (D-016)
- **Step:** `id`, `interaction`, `instructionKey`, `audioKey`, `params` (object, `{}` when none).
  Optional: `timeLimitSec` (UI countdown), `variants` (step runs only in these variants; in others
  the player emits `step_skipped` and moves on), `needsReview`.
- **Option** (in `params.options` of `choose_one`, `choose_many`, `checklist`, `decision`):
  `id`, `labelKey`. Optional: `forbidden` (bool; requires `tag`, emitted as `forbidden_action{tag}`),
  `forbiddenVariants` (forbidden only in these variants; default all), `needsReview`.
- **Rule:** `id`, `type`, `params`, `points`, `critical`, `feedbackKey`. Optional: `variants`,
  `criticalOn: "forbidden"` (docs/03), `needsReview`.
- **Variant:** `id`, `params`. Optional: `needsReview`.
- `needsReview: true` on any object marks content a safety expert must confirm; it does not change
  behaviour. The scenario-level flag stays `true` until the whole module is signed off. Gameplay
  tuning (arrival radii, hold window `durationSec`, `minCones`) is not safety content: it is not
  flagged and is tuned in device tests (T-28, T-33).
- Anchor, target and zone names (`LeakSource`, `FreshAirPoint`, `AttackSpot`, `FireBase`,
  `AlarmCallPoint`, ...) are objects inside the prefab placed by the scenario's `place_on_plane`
  step; marker ids (`EXIT_A`) come from `setup.markers`.

### Params by interaction type (D-016)
| Type | `params` |
|---|---|
| `narration` | none |
| `place_on_plane` | `prefab` (scene prefab name); any other keys are passed to the prefab (e.g. `fireType`) |
| `tap_target` | `target` (named scene object) |
| `choose_one`, `choose_many`, `checklist`, `decision` | `options` (see Fields) |
| `aim_and_hold` | `targetZone`, `offTargetZones` (list), `durationSec` (length of the hold phase) |
| `find_marker` | `marker` (must be listed in `setup.markers`) |
| `move_to` | `anchor` (scene anchor name or marker id), `radiusM`. Optional: `showRoute` (AR arrows), `exitBehind {marker, minAngleDeg}` (then `step_completed` carries `exitBehind: true/false`), `detector {peakReading, alertLevel, dangerLevel}` (simulated gas reading rising with proximity) |
| `mark_zone` | `hazard` (anchor name), `trueRadiusM` (scored by `zone_accuracy`), `minCones` |

## Interaction types (the only step types the player supports)
| Type | AR behaviour | Tabletop fallback | Events emitted |
|---|---|---|---|
| `narration` | Audio + caption, auto-advance | same | `step_started`, `step_completed` |
| `place_on_plane` | Tap a detected horizontal plane to anchor a prefab | Auto-placed at room centre | `step_completed{position}` |
| `tap_target` | Tap a named object in the scene | same | `target_hit{target}` |
| `choose_one` | Pick one of N 3D items / cards | same | `choice_made{option}` |
| `choose_many` | Toggle items on a rack, press Done | same | `choice_made{options[]}` |
| `aim_and_hold` | Point screen-centre reticle at a zone, hold | Drag reticle with finger | `hold_progress{zone,onTargetSec}` per 0.25 s, `step_completed` |
| `find_marker` | Detect a printed image marker via image tracking | Tap the exit sign in virtual room | `marker_found{marker}` |
| `move_to` | Physically walk until camera within `radiusM` of an anchor | Tap waypoints along a path | `position_reached{anchor,distanceM}` |
| `mark_zone` | Tap floor points to place cones around a hazard | Tap floor points | `zone_marked{radiusM}` |
| `checklist` | Tap each item on the buddy avatar | same | `choice_made{options[]}` |
| `decision` | Situation card with options (voice read-out) | same | `choice_made{option}` |
Any option tagged `forbidden` also emits `forbidden_action{tag}` when chosen.

## FIRE_01 — Fire & Explosion Response
Context: a small fire starts near waste material in a workshop / surface plant area.
Variants: `ordinary` (paper, wood, cloth) and `oil` (oil / grease fire).

| # | Step id | Interaction | What the worker does | Notes |
|---|---|---|---|---|
| 1 | `brief` | narration | Hears the situation | Not scored |
| 2 | `place_fire` | place_on_plane | Places the fire on the real floor | Setup, not scored |
| 3 | `raise_alarm` | tap_target | Raises the alarm (call point / shouts "Fire") | Must happen before fighting |
| 4 | `find_exit` | find_marker | Finds the nearest printed EXIT marker | Anchors the escape route |
| 5 | `pick_extinguisher` | choose_one | Chooses from: water-type, dry chemical powder (DCP), CO2 | `oil` variant: water-type is `forbidden` |
| 6 | `approach` | move_to | Moves to the attack spot with the exit behind them | Checked: exit marker direction is behind camera forward (angle > 120°) |
| 7 | `extinguish` | aim_and_hold | Aims at the base of the fire, holds | Aiming at flame tops counts as off-target |
| 8 | `escalation` | decision | Fire spreads (scripted). Options: keep fighting / evacuate and alert / collect belongings | Only "evacuate and alert" is correct; "keep fighting" and "collect belongings" are `forbidden` |
| 9 | `evacuate` | move_to | Follows AR arrows to the exit marker | Time limited |
| 10 | `assembly` | decision | At assembly point: report to supervisor for headcount / go back inside / leave site | Only "report" is correct |

Rules (points total 100):
| Rule id | Type | Params | Points | Critical |
|---|---|---|---|---|
| R_ALARM_BEFORE_FIGHT | order | before `raise_alarm`, after `extinguish` | 10 | yes |
| R_ALARM_FAST | time_limit | step `raise_alarm`, 20 s | 5 | no |
| R_EXIT_FOUND | completed | step `find_exit` | 10 | no |
| R_RIGHT_EXTINGUISHER | correct_choice | step `pick_extinguisher`, correct by variant | 15 | yes (if forbidden picked) |
| R_EXIT_BEHIND | completed | step `approach` with `exitBehind=true` | 10 | no |
| R_AIM_BASE | hold | step `extinguish`, onTargetSec ≥ 4, offTargetRatio ≤ 0.4 | 15 | no |
| R_EVACUATE_DECISION | correct_choice | step `escalation` | 15 | yes |
| R_EVACUATE_TIME | time_limit | step `evacuate`, 60 s | 10 | no |
| R_ASSEMBLY_REPORT | correct_choice | step `assembly` | 10 | no |

## GAS_01 — Gas Leak & Confined Space Protocol
Context: a two-person team is about to enter a confined work area; a gas leak develops.
Variants: `minor` (reading rises to alert level) and `major` (reading reaches danger level; self-rescuer needed).
Detector levels are abstract (`alertLevel`, `dangerLevel` in variant params); real thresholds need review.

| # | Step id | Interaction | What the worker does | Notes |
|---|---|---|---|---|
| 1 | `brief` | narration | Hears the task | Not scored |
| 2 | `place_area` | place_on_plane | Places the confined-area entrance and leak source | Setup |
| 3 | `ppe` | choose_many | Picks from rack: self-rescuer, gas detector, helmet with cap lamp, dust mask, matches/lighter | Correct: first three. Dust mask = wrong. Matches/lighter = `forbidden` (contraband) |
| 4 | `buddy_check` | checklist | Checks buddy: detector on, self-rescuer carried, lamp working, hand signals agreed | All 4 required |
| 5 | `detect` | move_to | Moves toward the area; detector reading rises with proximity | Records peak reading |
| 6 | `mark_zone` | mark_zone | Places cones where the detector hits alert level | Scored against true radius ± tolerance |
| 7 | `ignition_trap` | decision | "Switch on the fan / light switch here?" Options: operate switch / do not touch, move away | Operate switch = `forbidden` |
| 8 | `self_rescuer` | decision | `major` only: don self-rescuer now / continue without | `minor`: step skipped, rule auto-awarded |
| 9 | `enter_or_retreat` | decision | Options: retreat to fresh air and signal buddy / enter alone to fix quickly / hold breath and continue | Only retreat is correct; "enter alone" is `forbidden` |
| 10 | `retreat` | move_to | Moves to the fresh-air point with buddy | Time limited |
| 11 | `report` | decision | Report and keep area barricaded / re-enter after 5 min / tell no one | Only report is correct |

Rules (points total 100):
| Rule id | Type | Params | Points | Critical |
|---|---|---|---|---|
| R_PPE | correct_choice | step `ppe` (partial credit) | 15 | yes (if forbidden picked) |
| R_BUDDY_CHECK | correct_choice | step `buddy_check`, all 4 items | 15 | no |
| R_ZONE_ACCURACY | zone_accuracy | step `mark_zone`, toleranceM 0.5 | 15 | no |
| R_NO_IGNITION | no_forbidden | tag `ignition_source` | 10 | yes |
| R_SELF_RESCUER | correct_choice | step `self_rescuer` | 10 | yes (`major` only) |
| R_ORDER_RESCUER_RETREAT | order | before `self_rescuer`, after `retreat` (`major` only) | 5 | no |
| R_RETREAT_DECISION | correct_choice | step `enter_or_retreat` | 15 | yes |
| R_RETREAT_TIME | time_limit | step `retreat`, 45 s | 5 | no |
| R_REPORT | correct_choice | step `report` | 10 | no |

## Markers
- `EXIT_A`, `EXIT_B`: A5 printed, physical width 0.15 m, stored in `Assets/_Project/Markers/`.
- Demo setup: tape `EXIT_A` beside a real door at chest height (see `docs/09-DEMO-SCRIPT.md`).

## Roadmap domains (content only, not built)
Machinery Safety and the remaining PS domains reuse the same interaction types; list them in the
README roadmap once the full PS description is confirmed.
