"""Server-side recheck of a device's AttemptResult (docs/05 "Sync ingest rules", docs/03, D-022).

The server has no event-level engine; it trusts per-rule `earned`/`passed` as reported, but
recomputes the totals and checks the rules against the scenario file. It never trusts the
device's `scorePercent`, `passed` or `criticalFailures`. Any disagreement is a flag reason; the
attempt is still accepted and stored with the server's values.
"""

import math
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any

from app.services.content import Scenario


def round_half_away_from_zero(value: Fraction) -> int:
    """docs/03 `round()` for scorePercent (D-022): 82.5 -> 83.

    C# must pass MidpointRounding.AwayFromZero; its default (and Python's round) gives 82.
    """
    return (
        math.floor(value + Fraction(1, 2)) if value >= 0 else -math.floor(-value + Fraction(1, 2))
    )


@dataclass(frozen=True)
class RuleResult:
    rule_id: str
    earned: Fraction
    max: Fraction
    critical: bool
    passed: bool


@dataclass
class Recheck:
    score_percent: int
    passed: bool
    critical_failures: list[str]
    reasons: list[str] = field(default_factory=list)

    @property
    def flag_reason(self) -> str | None:
        return "; ".join(self.reasons)[:1000] if self.reasons else None


def recheck_attempt(
    scenario: Scenario,
    variant: str,
    rules: list[RuleResult],
    events: list[Any],
    *,
    reported_score: int,
    reported_passed: bool,
    reported_critical_failures: list[str],
) -> Recheck:
    reasons: list[str] = []
    if variant not in scenario.variants:
        reasons.append(f"unknown variant {variant}")
    expected = scenario.rules_for(variant)

    seen: set[str] = set()
    earned_total = max_total = Fraction(0)
    critical_failures: list[str] = []
    for rule in rules:
        if rule.rule_id in seen:
            reasons.append(f"rule {rule.rule_id} reported twice")
            continue
        seen.add(rule.rule_id)
        spec = expected.get(rule.rule_id)
        if spec is None:
            where = "for this variant" if rule.rule_id in scenario.rules else "in the scenario"
            reasons.append(f"rule {rule.rule_id} is not scored {where}")
            continue
        if rule.max != spec.points:
            reasons.append(f"rule {rule.rule_id} max {rule.max}, scenario says {spec.points}")
        if not 0 <= rule.earned <= rule.max:
            reasons.append(f"rule {rule.rule_id} earned {rule.earned} outside 0..{rule.max}")
        if rule.critical != spec.critical:
            reasons.append(
                f"rule {rule.rule_id} critical={rule.critical}, scenario says {spec.critical}"
            )
        earned_total += rule.earned
        max_total += rule.max
        if not spec.critical:  # criticality comes from the scenario, not the device
            continue
        # docs/03: a critical rule fails if it earns 0, unless criticalOn=forbidden (D-017)
        zero_fails = spec.critical_on is None and rule.earned == 0
        if zero_fails and rule.passed:
            reasons.append(f"critical rule {rule.rule_id} earned 0 but was reported passed")
        if zero_fails or not rule.passed:
            critical_failures.append(rule.rule_id)
    for missing in sorted(expected.keys() - seen):
        reasons.append(f"rule {missing} missing")

    score = round_half_away_from_zero(100 * earned_total / max_total) if max_total else 0
    aborted = any(isinstance(e, dict) and e.get("type") == "attempt_aborted" for e in events)
    passed = not critical_failures and not aborted and score >= scenario.pass_threshold_percent

    if reported_score != score:
        reasons.append(f"scorePercent {reported_score}, server computed {score}")
    if reported_passed != passed:
        reasons.append(
            f"passed {str(reported_passed).lower()}, server computed {str(passed).lower()}"
        )
    if sorted(reported_critical_failures) != sorted(critical_failures):
        reasons.append("criticalFailures differ from the critical rules that failed")
    return Recheck(score, passed, critical_failures, reasons)
