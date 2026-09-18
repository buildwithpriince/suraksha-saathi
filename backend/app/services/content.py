"""Server view of /content: scenario metadata for sync validation, plus the content manifest.

Only the fields the server needs are read here; full validation of scenario files is T-16's tool.
"""

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ScenarioRule:
    id: str
    points: int
    critical: bool
    critical_on: str | None  # "forbidden": only a forbidden action fails it critically (D-017)
    variants: frozenset[str] | None  # None: scored in every variant


@dataclass(frozen=True)
class Scenario:
    id: str
    version: int
    pass_threshold_percent: int
    validity_days: int
    variants: frozenset[str]
    rules: dict[str, ScenarioRule]

    def rules_for(self, variant: str) -> dict[str, ScenarioRule]:
        """Rules scored in this variant; variant-scoped rules are skipped elsewhere (docs/03)."""
        return {
            rule_id: rule
            for rule_id, rule in self.rules.items()
            if rule.variants is None or variant in rule.variants
        }


@dataclass(frozen=True)
class ContentCatalog:
    content_version: str
    scenarios: dict[tuple[str, int], Scenario]

    def scenario(self, scenario_id: str, version: int) -> Scenario | None:
        return self.scenarios.get((scenario_id, version))

    def latest(self) -> list[Scenario]:
        """One entry per scenario id, newest version, sorted by id."""
        newest: dict[str, Scenario] = {}
        for scenario in self.scenarios.values():
            if scenario.id not in newest or scenario.version > newest[scenario.id].version:
                newest[scenario.id] = scenario
        return [newest[key] for key in sorted(newest)]


def _scenario(raw: dict) -> Scenario:
    rules = {}
    for rule in raw["rules"]:
        variants = rule.get("variants")
        rules[rule["id"]] = ScenarioRule(
            id=rule["id"],
            points=int(rule["points"]),
            critical=bool(rule.get("critical", False)),
            critical_on=rule.get("criticalOn"),
            variants=frozenset(variants) if variants else None,
        )
    return Scenario(
        id=raw["id"],
        version=int(raw["version"]),
        pass_threshold_percent=int(raw["passThresholdPercent"]),
        validity_days=int(raw["validityDays"]),
        variants=frozenset(variant["id"] for variant in raw.get("variants", [])),
        rules=rules,
    )


def load_catalog(content_dir: Path) -> ContentCatalog:
    """content/manifest.json (contentVersion, D-024) + content/scenarios/*.json."""
    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    scenarios = {}
    for path in sorted((content_dir / "scenarios").glob("*.json")):
        scenario = _scenario(json.loads(path.read_text(encoding="utf-8")))
        scenarios[(scenario.id, scenario.version)] = scenario
    return ContentCatalog(content_version=str(manifest["contentVersion"]), scenarios=scenarios)
