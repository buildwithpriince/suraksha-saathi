# 03 — Assessment Engine (pure TypeScript, `mobile/src/core/assessment`; D-027)

## Principle
`AttemptResult Evaluate(Scenario scenario, string variantId, IReadOnlyList<AttemptEvent> events)`
is a pure function. Same inputs, same output. No clocks, no randomness, no platform APIs inside.

## Event model
```json
{ "t": 12.43, "type": "choice_made", "stepId": "pick_extinguisher", "data": { "option": "dcp" } }
```
- `t`: seconds since attempt start (monotonic clock), 2 decimals.
- `type`: `step_started | step_completed | step_skipped | choice_made | target_hit | hold_progress |
  marker_found | position_reached | zone_marked | forbidden_action | attempt_aborted`.
- Events are append-only. The player writes them; the engine only reads them.

## Rule types
| Type | Params | Earned points |
|---|---|---|
| `completed` | `step`, optional `where` (data key = value) | full if a `step_completed` for step exists (and `where` matches), else 0 |
| `order` | `before`, `after` | full if `before` completed and its completion `t` < `after`'s `step_started` `t`; 0 otherwise |
| `time_limit` | `step`, `seconds` | full if completed within `seconds` of its `step_started` |
| `correct_choice` | `step`, `correct` (list or per-variant map), `partial` (bool) | single: full if first choice in `correct`. `partial`: `points × max(0, rightPicked − wrongPicked) / correct.count`, rounded down. Multi-select steps (`choose_many`, `checklist`) without `partial`: full only if the picked set equals `correct` (D-017) |
| `no_forbidden` | `tag` | full if no `forbidden_action` with that tag |
| `hold` | `step`, `minOnTargetSec`, `maxOffTargetRatio` | full if both met; half if only on-target met; else 0. Each `hold_progress` in the step is one 0.25 s sample: `zone` is the zone under the reticle (`"none"` if none) and `onTargetSec` is cumulative. onTarget = the largest `onTargetSec` in the step; offTargetRatio = samples whose `zone` is in the step's `offTargetZones` / all samples in the step (D-028) |
| `zone_accuracy` | `step`, `toleranceM` (true radius = the step's `trueRadiusM` after `$` variant substitution) | full if abs error ≤ tol; half if ≤ 2×tol; else 0 |

Critical rules:
- A `critical` rule "fails" if it earns 0 **or** if any `forbidden_action` occurred in its step
  (the rule's `params.step`; `order` and `no_forbidden` rules have none, so only the 0 check applies).
- With `"criticalOn": "forbidden"` it fails critically **only** if a `forbidden_action` occurred in
  its step; earning 0 alone is then just lost points (docs/02 "critical if forbidden picked", D-017).
- Rules scoped to a variant (`"variants": ["major"]`) are skipped for other variants; skipped rules
  are removed from both earned and max (they never help or hurt).

Steps the worker skips (D-033):
- The app offers "Skip step" after 30 s without progress in a step. The player then emits
  `step_skipped` for that step with `data: { "reason": "no_progress" }` and moves on. A `step_skipped`
  for a step that runs in the attempt's variant is a worker skip (steps outside the variant are
  `step_skipped` too, but their rules are variant-scoped and already left out).
- A worker-skipped step always scores as failed, never as a pass. Every rule tied to it earns 0 and
  has `passed: false`, whatever was recorded in the step before the skip. A rule is tied to the step
  if its `step`, `before` or `after` names it, or if it is a `no_forbidden` rule whose `tag` is on one
  of the step's options (skipping the question must not earn "no forbidden act").
- A critical rule tied to a skipped step is a critical failure, even with `criticalOn: "forbidden"`,
  so skipping a critical step fails the attempt (docs/00 R3: a critical-step miss fails regardless of score).

## Result
```
scorePercent = round(100 × Σearned / Σmax)            // Σmax over non-skipped rules
passed       = criticalFailures.Count == 0 && scorePercent >= scenario.passThresholdPercent
```
`round` = round half away from zero (D-022): 92.5 -> 93, 82.5 -> 83. Compute it in integers
(`floor((200 × Σearned + Σmax) / (2 × Σmax))`) so every language agrees (D-028). The
backend recomputes the score with this rule and flags any mismatch. Skipped rules are left out of `rules[]`.
`attempt_aborted` present -> `passed = false`, score still computed for feedback.
Earned points are integers: "half" is `floor(points / 2)` (15 -> 7), like `partial`'s round-down (D-028).
Per-rule `passed`: for a critical rule, false only on a critical failure; for any other rule, `earned == max`.

```json
{
  "attemptId": "uuidv7", "scenarioId": "FIRE_01", "scenarioVersion": 1, "variant": "oil", "seed": 123456,
  "mode": "ar", "startedAt": 1789000000, "durationSec": 212.4,
  "scorePercent": 86, "passed": true, "criticalFailures": [],
  "rules": [ { "ruleId": "R_ALARM_BEFORE_FIGHT", "earned": 10, "max": 10, "critical": true, "passed": true, "feedbackKey": "fire01.rule.alarm_before_fight" } ],
  "eventsSha256": "hex of SHA-256 over UTF-8 JSON of the events array as stored"
}
```

## Result screen requirements
- Big PASS / NOT YET, score, and a list of rules sorted: failed criticals first, then lost points.
- Each row reads its `feedbackKey` aloud on tap (voice-first).
- "Try again" starts a new attempt with a new seed (possibly a different variant).

## Required unit tests (`CoreTests~`)
1. Perfect FIRE_01 `ordinary` run -> 100, passed
2. Alarm after extinguish -> critical failure, passed=false even with score ≥ 70
3. `oil` variant picks water-type -> R_RIGHT_EXTINGUISHER fails critical
4. `ordinary` variant picks water-type -> full points
5. Hold with onTarget 5 s but offTargetRatio 0.6 -> half points
6. Evacuate in 61 s -> time rule 0, others unaffected
7. GAS_01 `minor`: self-rescuer rules skipped; max total excludes them
8. GAS_01 PPE partial: 3 right + dust mask -> floor(15 × 2/3) = 10
9. GAS_01 PPE with matches -> critical failure
10. `zone_accuracy` at exactly tolerance -> full; at 1.5× -> half; at 2.1× -> 0
11. Events out of chronological order in list -> engine sorts by `t` stably before evaluating
12. Same inputs twice -> byte-identical serialized result (determinism)
13. `attempt_aborted` -> passed=false
