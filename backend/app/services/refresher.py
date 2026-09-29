"""Refresher drills (docs/03 "Refresher drills", D-044): the server's copy of the app's derivation.

`mobile/src/core/refresher/derive.ts` builds the shortened scenario a refresher is played and
scored on. The server needs the same rule set to recheck a synced refresher (docs/05) and to
compare initial scores with refresher scores on the dashboard. Both implementations are tested
against the same expected step and rule ids for FIRE_01 and GAS_01, so they can't drift apart.
"""

from dataclasses import replace

from app.services.content import Scenario, ScenarioRule, ScenarioStep


def rule_steps(rule: ScenarioRule, steps: tuple[ScenarioStep, ...]) -> list[str]:
    """Steps a rule scores: step / before / after, and for no_forbidden every step whose
    options carry its tag."""
    tied = list(rule.step_refs)
    if rule.type == "no_forbidden":
        tied += [s.id for s in steps if rule.tag in s.option_tags]
    return tied


def _needs(step: ScenarioStep, steps: tuple[ScenarioStep, ...]) -> list[str]:
    needs = [step.agent_from] if step.agent_from else []
    if step.exit_marker:
        needs += [
            s.id for s in steps if s.interaction == "find_marker" and s.marker == step.exit_marker
        ]
    return needs


def refresher_step_ids(scenario: Scenario) -> list[str]:
    """Kept steps in file order: critical rules' steps, place_on_plane steps, and their needs."""
    kept: set[str] = set()
    for rule in scenario.rules.values():
        if rule.critical:
            kept.update(rule_steps(rule, scenario.steps))
    kept.update(s.id for s in scenario.steps if s.interaction == "place_on_plane")
    grew = True
    while grew:
        grew = False
        for step in scenario.steps:
            if step.id not in kept:
                continue
            for need in _needs(step, scenario.steps):
                if need not in kept:
                    kept.add(need)
                    grew = True
    return [s.id for s in scenario.steps if s.id in kept]


def refresher_scenario(scenario: Scenario) -> Scenario:
    """The scenario a refresher is scored on: every rule whose tied steps all run."""
    kept = set(refresher_step_ids(scenario))
    rules = {
        rule_id: rule
        for rule_id, rule in scenario.rules.items()
        if (tied := rule_steps(rule, scenario.steps)) and all(s in kept for s in tied)
    }
    steps = tuple(s for s in scenario.steps if s.id in kept)
    return replace(scenario, rules=rules, steps=steps)
