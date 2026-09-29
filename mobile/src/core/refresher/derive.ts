/**
 * Refresher drills (D-044): a shortened run of a module that keeps its critical steps.
 *
 * `refresherScenario` is a pure function of the scenario file, so the app and the backend derive
 * the same steps and rules without any extra content. The unchanged engine (docs/03) then scores
 * the smaller scenario, and the unchanged ScenarioSession plays it: only the step list is shorter.
 */
import type { Rule, Scenario, Step } from '../scenarios/types';
import { stepOptions } from '../scenarios/variants';

/**
 * The steps a rule scores: `step`, `before`, `after`, and for `no_forbidden` every step with an
 * option carrying its tag (the same ties D-033 uses for skipped steps).
 */
export function ruleSteps(rule: Rule, steps: readonly Step[]): string[] {
  const p = rule.params;
  const named = [p.step, p.before, p.after].filter((s): s is string => typeof s === 'string');
  if (rule.type !== 'no_forbidden') return named;
  return [...named, ...steps.filter((s) => stepOptions(s).some((o) => o.tag === p.tag)).map((s) => s.id)];
}

/** Steps a step can't run without: the pick an extinguisher's agent comes from, the scanned exit it is measured against. */
function stepNeeds(step: Step, steps: readonly Step[]): string[] {
  const needs: string[] = [];
  if (typeof step.params.agentFrom === 'string') needs.push(step.params.agentFrom);
  const behind = step.params.exitBehind;
  if (behind !== null && typeof behind === 'object' && !Array.isArray(behind) && typeof behind.marker === 'string') {
    const marker = behind.marker;
    needs.push(...steps.filter((s) => s.interaction === 'find_marker' && s.params.marker === marker).map((s) => s.id));
  }
  return needs;
}

/**
 * The refresher version of a scenario. Keeps, in their original order:
 * - every step a critical rule scores (`ruleSteps`),
 * - `place_on_plane` steps (unscored, but every later overlay is drawn from the placement),
 * - the steps those steps need (`agentFrom`, the `find_marker` of an `exitBehind`).
 * Keeps every rule, critical or not, whose steps all run. Id, version, variants, threshold and
 * everything else are the scenario's own, so attempts still reference the real scenario file.
 */
export function refresherScenario(scenario: Scenario): Scenario {
  const kept = new Set<string>();
  for (const rule of scenario.rules) {
    if (rule.critical) ruleSteps(rule, scenario.steps).forEach((id) => kept.add(id));
  }
  for (const step of scenario.steps) if (step.interaction === 'place_on_plane') kept.add(step.id);
  for (let grew = true; grew; ) {
    grew = false;
    for (const step of scenario.steps) {
      if (!kept.has(step.id)) continue;
      for (const id of stepNeeds(step, scenario.steps)) {
        if (!kept.has(id)) {
          kept.add(id);
          grew = true;
        }
      }
    }
  }
  const steps = scenario.steps.filter((s) => kept.has(s.id));
  const rules = scenario.rules.filter((r) => {
    const tied = ruleSteps(r, scenario.steps);
    return tied.length > 0 && tied.every((id) => kept.has(id));
  });
  return { ...scenario, steps, rules };
}
