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
    # How the rule is tied to steps (refresher derivation, D-044)
    type: str = ""
    step_refs: tuple[str, ...] = ()  # params step / before / after
    tag: str | None = None  # no_forbidden


@dataclass(frozen=True)
class ScenarioStep:
    """The step wiring the refresher derivation needs (D-044), not the full docs/02 step."""

    id: str
    interaction: str
    option_tags: frozenset[str]
    agent_from: str | None  # operate_extinguisher: the step the agent was picked in
    exit_marker: str | None  # move_to exitBehind: the marker its exit was scanned from
    marker: str | None  # find_marker: the marker it scans


@dataclass(frozen=True)
class Scenario:
    id: str
    version: int
    pass_threshold_percent: int
    validity_days: int
    variants: frozenset[str]
    rules: dict[str, ScenarioRule]
    steps: tuple[ScenarioStep, ...] = ()

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
    # content/refresher.json dueDays (D-044): the dashboard's retention stages
    refresher_due_days: tuple[int, ...] = ()

    def scenario(self, scenario_id: str, version: int) -> Scenario | None:
        return self.scenarios.get((scenario_id, version))

    def latest(self) -> list[Scenario]:
        """One entry per scenario id, newest version, sorted by id."""
        newest: dict[str, Scenario] = {}
        for scenario in self.scenarios.values():
            if scenario.id not in newest or scenario.version > newest[scenario.id].version:
                newest[scenario.id] = scenario
        return [newest[key] for key in sorted(newest)]


def _text(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _step(raw: dict) -> ScenarioStep:
    params = raw.get("params") or {}
    options = params.get("options") if isinstance(params.get("options"), list) else []
    exit_behind = params.get("exitBehind")
    return ScenarioStep(
        id=raw["id"],
        interaction=raw["interaction"],
        option_tags=frozenset(o["tag"] for o in options if isinstance(o.get("tag"), str)),
        agent_from=_text(params.get("agentFrom")),
        exit_marker=_text(exit_behind.get("marker")) if isinstance(exit_behind, dict) else None,
        marker=_text(params.get("marker")),
    )


def _scenario(raw: dict) -> Scenario:
    rules = {}
    for rule in raw["rules"]:
        variants = rule.get("variants")
        params = rule.get("params") or {}
        rules[rule["id"]] = ScenarioRule(
            id=rule["id"],
            points=int(rule["points"]),
            critical=bool(rule.get("critical", False)),
            critical_on=rule.get("criticalOn"),
            variants=frozenset(variants) if variants else None,
            type=rule["type"],
            step_refs=tuple(
                ref for key in ("step", "before", "after") if (ref := _text(params.get(key)))
            ),
            tag=_text(params.get("tag")),
        )
    return Scenario(
        id=raw["id"],
        version=int(raw["version"]),
        pass_threshold_percent=int(raw["passThresholdPercent"]),
        validity_days=int(raw["validityDays"]),
        variants=frozenset(variant["id"] for variant in raw.get("variants", [])),
        rules=rules,
        steps=tuple(_step(step) for step in raw.get("steps", [])),
    )


def load_catalog(content_dir: Path) -> ContentCatalog:
    """content/manifest.json (contentVersion, D-024) + content/scenarios/*.json, and
    content/refresher.json (D-044) when present."""
    manifest = json.loads((content_dir / "manifest.json").read_text(encoding="utf-8"))
    scenarios = {}
    for path in sorted((content_dir / "scenarios").glob("*.json")):
        scenario = _scenario(json.loads(path.read_text(encoding="utf-8")))
        scenarios[(scenario.id, scenario.version)] = scenario
    refresher_path = content_dir / "refresher.json"
    due_days: tuple[int, ...] = ()
    if refresher_path.exists():
        due_days = tuple(
            int(d) for d in json.loads(refresher_path.read_text(encoding="utf-8"))["dueDays"]
        )
    return ContentCatalog(
        content_version=str(manifest["contentVersion"]),
        scenarios=scenarios,
        refresher_due_days=due_days,
    )
