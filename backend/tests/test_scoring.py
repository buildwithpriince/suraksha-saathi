"""T-53: server recheck of AttemptResults and the content catalog it reads."""

from fractions import Fraction
from pathlib import Path

import pytest

from app.services.content import ContentCatalog, load_catalog
from app.services.scoring import RuleResult, recheck_attempt, round_half_away_from_zero

CONTENT = Path(__file__).resolve().parents[2] / "content"


@pytest.fixture(scope="module")
def catalog() -> ContentCatalog:
    return load_catalog(CONTENT)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (Fraction(185, 2), 93),  # 92.5
        (Fraction(165, 2), 83),  # 82.5 (banker's would give 82)
        (Fraction(1, 2), 1),
        (Fraction(0), 0),
        (Fraction(2449, 25), 98),  # 97.96
        (Fraction(-5, 2), -3),
    ],
)
def test_round_half_away_from_zero(value: Fraction, expected: int) -> None:
    assert round_half_away_from_zero(value) == expected


def test_catalog_reads_the_repo_content(catalog: ContentCatalog) -> None:
    fire = catalog.scenario("FIRE_01", 1)
    gas = catalog.scenario("GAS_01", 1)

    assert fire is not None
    assert gas is not None
    assert (fire.pass_threshold_percent, fire.validity_days) == (70, 365)
    assert sum(rule.points for rule in fire.rules.values()) == 100
    assert [s.id for s in catalog.latest()] == ["FIRE_01", "GAS_01"]
    assert catalog.content_version == "2026.09.7"
    assert gas.rules["R_PPE"].critical_on == "forbidden"
    assert gas.rules["R_SELF_RESCUER"].variants == frozenset({"major"})


def _honest(catalog: ContentCatalog, scenario_id: str, variant: str) -> list[RuleResult]:
    scenario = catalog.scenario(scenario_id, 1)
    assert scenario is not None
    return [
        RuleResult(r.id, Fraction(r.points), Fraction(r.points), r.critical, True)
        for r in scenario.rules_for(variant).values()
    ]


def _recheck(
    catalog: ContentCatalog,
    rules: list[RuleResult],
    *,
    scenario_id: str = "FIRE_01",
    variant: str = "ordinary",
    score: int = 100,
    passed: bool = True,
    critical: list[str] | None = None,
):
    scenario = catalog.scenario(scenario_id, 1)
    assert scenario is not None
    return recheck_attempt(
        scenario,
        variant,
        rules,
        [],
        reported_score=score,
        reported_passed=passed,
        reported_critical_failures=critical or [],
    )


def test_honest_perfect_run_has_no_reasons(catalog: ContentCatalog) -> None:
    recheck = _recheck(catalog, _honest(catalog, "FIRE_01", "ordinary"))

    assert (recheck.score_percent, recheck.passed, recheck.reasons) == (100, True, [])


def test_missing_rule_is_flagged_and_scored_out_of_the_rest(catalog: ContentCatalog) -> None:
    rules = _honest(catalog, "FIRE_01", "ordinary")[1:]  # drop R_ALARM_BEFORE_FIGHT (10 pts)

    recheck = _recheck(catalog, rules)

    assert "rule R_ALARM_BEFORE_FIGHT missing" in recheck.reasons
    assert recheck.score_percent == 100


def test_rule_from_another_variant_is_flagged(catalog: ContentCatalog) -> None:
    rules = _honest(catalog, "GAS_01", "major")  # includes the major-only rules

    recheck = _recheck(catalog, rules, scenario_id="GAS_01", variant="minor")

    assert "rule R_SELF_RESCUER is not scored for this variant" in recheck.reasons


def test_unknown_rule_and_variant_are_flagged(catalog: ContentCatalog) -> None:
    rules = [*_honest(catalog, "FIRE_01", "ordinary"), RuleResult("R_BONUS", 5, 5, False, True)]  # type: ignore[arg-type]

    recheck = _recheck(catalog, rules, variant="volcano")

    assert "unknown variant volcano" in recheck.reasons
    assert "rule R_BONUS is not scored in the scenario" in recheck.reasons


def test_device_cannot_downgrade_a_critical_rule(catalog: ContentCatalog) -> None:
    rules = _honest(catalog, "FIRE_01", "ordinary")
    rules[0] = RuleResult("R_ALARM_BEFORE_FIGHT", Fraction(10), Fraction(10), False, False)

    recheck = _recheck(catalog, rules)

    assert recheck.critical_failures == ["R_ALARM_BEFORE_FIGHT"]
    assert recheck.passed is False
    assert "rule R_ALARM_BEFORE_FIGHT critical=False, scenario says True" in recheck.reasons


def test_critical_on_forbidden_rule_at_zero_is_not_a_critical_failure(
    catalog: ContentCatalog,
) -> None:
    """D-017: picking CO2 on an ordinary fire costs the points but is not a critical failure."""
    rules = _honest(catalog, "FIRE_01", "ordinary")
    index = next(i for i, r in enumerate(rules) if r.rule_id == "R_RIGHT_EXTINGUISHER")
    rules[index] = RuleResult("R_RIGHT_EXTINGUISHER", Fraction(0), Fraction(15), True, True)

    recheck = _recheck(catalog, rules, score=85)

    assert recheck.critical_failures == []
    assert (recheck.score_percent, recheck.passed, recheck.reasons) == (85, True, [])


def test_earned_above_max_is_flagged(catalog: ContentCatalog) -> None:
    rules = _honest(catalog, "FIRE_01", "ordinary")
    rules[1] = RuleResult("R_ALARM_FAST", Fraction(50), Fraction(5), False, True)

    recheck = _recheck(catalog, rules)

    assert "rule R_ALARM_FAST earned 50 outside 0..5" in recheck.reasons
