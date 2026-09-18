"""Seed the demo dataset from docs/08 into an empty, migrated database.

3 sites (DHN-01 coal, JSR-02 steel, KDM-03 mica), 40 workers, ~150 attempts with realistic
failures (GAS_01 R_BUDDY_CHECK fails most), 12 certificates expiring within 30 days, 1 revoked
certificate, 1 pending device, and 2 flagged attempts. Every token is really signed: SA1 by the
root key, SS1 by a per-kiosk key. So /verify, the revocation list and the app's offline checks
all work on demo data. Names and outcomes are deterministic (`--seed`); keys are fresh each run.

    uv run alembic upgrade head
    uv run python -m app.tools.seed_demo [--admin USER_ID] [--supervisor USER_ID:SITE_CODE]

Needs DATABASE_URL and ROOT_SIGNING_KEY_B64 (see backend/.env.example). Refuses to run twice.
"""

import argparse
import asyncio
import json
import random
import sys
import time
import uuid
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crypto.bodies import AttestationBody, CertificateBody, ModuleScore
from app.crypto.keys import load_root_private_key, public_key_b64url
from app.crypto.tokens import Prefix, sign_token
from app.db.engine import create_engine, create_sessionmaker
from app.db.ids import uuid7
from app.db.models import AdminProfile, Attempt, Certificate, Device, Site, Worker
from app.services.content import ContentCatalog, Scenario, load_catalog
from app.services.revocations import publish_revocation_list
from app.services.scoring import RuleResult, recheck_attempt

DAY = 86400
REQUIRED = ("FIRE_01", "GAS_01")  # docs/04 issuance: prototype requires both

SITES = [
    ("DHN-01", "Dhanbad Colliery", "Dhanbad", "coal"),
    ("JSR-02", "Jamshedpur Steel Works", "East Singhbhum", "steel"),
    ("KDM-03", "Koderma Mica Unit", "Koderma", "mica"),
]
FIRST_NAMES = [
    "Ravi", "Sunita", "Anil", "Pooja", "Birsa", "Salomi", "Manoj", "Rekha", "Sanjay", "Kavita",
    "Mangal", "Sukhram", "Phulmani", "Deepak", "Geeta", "Budhan", "Sita", "Ramesh", "Anita",
    "Bishu", "Jitendra", "Lalita", "Suresh", "Mamta", "Chotu", "Basanti", "Rajesh", "Sarita",
]  # fmt: skip
SURNAMES = [
    "Munda", "Oraon", "Hembrom", "Soren", "Tudu", "Marandi", "Kisku", "Mahato", "Besra",
    "Murmu", "Hansda", "Toppo", "Lakra", "Ekka", "Kumar", "Kumari", "Baski", "Minz",
]  # fmt: skip
LANGS = ["hi"] * 5 + ["sat"] * 3 + ["en"] * 2

# Chance that an average trainee drops each rule. R_BUDDY_CHECK is the most-failed (docs/08).
FAIL_RATE = {
    "R_ALARM_BEFORE_FIGHT": 0.06, "R_ALARM_FAST": 0.2, "R_EXIT_FOUND": 0.1,
    "R_RIGHT_EXTINGUISHER": 0.04, "R_EXIT_BEHIND": 0.22, "R_AIM_BASE": 0.25,
    "R_EVACUATE_DECISION": 0.05, "R_EVACUATE_TIME": 0.18, "R_ASSEMBLY_REPORT": 0.12,
    "R_PPE": 0.04, "R_BUDDY_CHECK": 0.5, "R_ZONE_ACCURACY": 0.25, "R_NO_IGNITION": 0.05,
    "R_SELF_RESCUER": 0.08, "R_ORDER_RESCUER_RETREAT": 0.15, "R_RETREAT_DECISION": 0.05,
    "R_RETREAT_TIME": 0.18, "R_REPORT": 0.12,
}  # fmt: skip
HALF_POINT_RULES = {"R_AIM_BASE", "R_ZONE_ACCURACY"}  # hold / zone_accuracy can score half


def _rule_results(rules: list[dict[str, Any]]) -> list[RuleResult]:
    return [
        RuleResult(
            r["ruleId"], Fraction(r["earned"]), Fraction(r["max"]), r["critical"], r["passed"]
        )
        for r in rules
    ]


@dataclass
class ScenarioContent:
    spec: Scenario
    raw: dict[str, Any]

    def steps(self, variant: str) -> list[dict[str, Any]]:
        return [s for s in self.raw["steps"] if variant in s.get("variants", [variant])]

    def rule_raw(self, rule_id: str) -> dict[str, Any]:
        return next(r for r in self.raw["rules"] if r["id"] == rule_id)


@dataclass
class Kiosk:
    device: Device
    key: Ed25519PrivateKey
    site: Site
    old_attestation: str  # covers certificates issued about a year ago
    attestation: str  # current, stored on the device row


@dataclass
class SeedSummary:
    sites: int = 0
    workers: int = 0
    attempts: int = 0
    certificates: int = 0
    expiring_30d: int = 0
    revoked: int = 0
    flagged: int = 0
    pending_devices: int = 0
    notes: list[str] = field(default_factory=list)


class DemoBuilder:
    def __init__(
        self,
        session: AsyncSession,
        catalog: ContentCatalog,
        content_dir: Path,
        root_key: Ed25519PrivateKey,
        now: int,
        rng: random.Random,
    ) -> None:
        self.session, self.root_key, self.now, self.rng = session, root_key, now, rng
        self.summary = SeedSummary()
        self.content: dict[str, ScenarioContent] = {}
        for scenario_id in REQUIRED:
            spec = catalog.scenario(scenario_id, 1)
            assert spec is not None, f"{scenario_id} v1 missing from /content"
            raw = json.loads(
                (content_dir / "scenarios" / f"{scenario_id}.json").read_text(encoding="utf-8")
            )
            self.content[scenario_id] = ScenarioContent(spec, raw)

    def _id(self, at: int) -> uuid.UUID:
        return uuid7(at * 1000 + self.rng.randrange(1000), self.rng)

    def _attest(self, device: Device, site: Site, key: Ed25519PrivateKey, iat: int) -> str:
        body = AttestationBody(
            did=str(device.id),
            dpk=public_key_b64url(key.public_key()),
            site=site.code,
            iat=iat,
            exp=iat + 365 * DAY,
        )
        return sign_token(Prefix.ATTESTATION, body, self.root_key)

    # --- sites and devices ---

    def add_sites(self) -> list[Site]:
        sites = [
            Site(id=self._id(self.now - 500 * DAY), code=c, name=n, district=d, sector=s)
            for c, n, d, s in SITES
        ]
        self.session.add_all(sites)
        self.summary.sites = len(sites)
        return sites

    def add_kiosk(self, site: Site, number: int) -> Kiosk:
        key = Ed25519PrivateKey.generate()
        approved_at = self.now - 130 * DAY
        device = Device(
            id=self._id(self.now - 420 * DAY),
            site_id=site.id,
            label=f"Kiosk tablet {number} ({site.code})",
            public_key=public_key_b64url(key.public_key()),
            status="approved",
            approved_at=approved_at,
            last_seen_at=self.now - self.rng.randrange(1, 6) * 3600,
            created_at=self.now - 420 * DAY,
        )
        old = self._attest(device, site, key, self.now - 400 * DAY)
        current = self._attest(device, site, key, approved_at)
        device.attestation_token = current
        device.attestation_expires_at = approved_at + 365 * DAY
        self.session.add(device)
        return Kiosk(device, key, site, old, current)

    def add_pending_device(self, site: Site) -> None:
        key = Ed25519PrivateKey.generate()  # nobody keeps it: this tablet is never approved
        self.session.add(
            Device(
                id=self._id(self.now - 2 * DAY),
                site_id=site.id,
                label="Kiosk tablet 2 (new, awaiting approval)",
                public_key=public_key_b64url(key.public_key()),
                status="pending",
                created_at=self.now - 2 * DAY,
            )
        )
        self.summary.pending_devices += 1

    # --- workers ---

    def names(self, count: int) -> list[str]:
        pairs = [(f, s) for f in FIRST_NAMES for s in SURNAMES]
        return [f"{f} {s}" for f, s in self.rng.sample(pairs, count)]

    def add_worker(self, name: str, kiosk: Kiosk, created_at: int) -> Worker:
        worker = Worker(
            id=self._id(created_at),
            site_id=kiosk.site.id,
            display_name=name,
            employee_code=f"{kiosk.site.code[:3]}-{self.rng.randrange(1000, 9999)}",
            preferred_lang=self.rng.choice(LANGS),
            created_by_device_id=kiosk.device.id,
            created_at=created_at,
            updated_at=created_at,
        )
        self.session.add(worker)
        self.summary.workers += 1
        return worker

    # --- attempts ---

    def _roll_rules(
        self, content: ScenarioContent, variant: str, skill: float
    ) -> tuple[list[dict[str, Any]], set[str]]:
        """Per-rule results as an honest device engine reports them; plus forbidden steps."""
        rules, forbidden_steps = [], set()
        for rule in content.spec.rules_for(variant).values():
            raw = content.rule_raw(rule.id)
            earned: float = rule.points
            if self.rng.random() < FAIL_RATE.get(rule.id, 0.1) * skill:
                if rule.id in HALF_POINT_RULES and self.rng.random() < 0.6:
                    earned = rule.points / 2
                else:
                    earned = 0
                    if rule.critical_on == "forbidden":  # only a forbidden pick zeroes it here
                        forbidden_steps.add(raw["params"].get("step", ""))
            rules.append(
                {
                    "ruleId": rule.id,
                    "earned": earned,
                    "max": rule.points,
                    "critical": rule.critical,
                    "passed": earned == rule.points,
                    "feedbackKey": raw.get("feedbackKey"),
                }
            )
        return rules, forbidden_steps

    def _events(
        self, content: ScenarioContent, variant: str, forbidden_steps: set[str], duration: float
    ) -> list[dict[str, Any]]:
        steps = content.steps(variant)
        slot = duration / max(len(steps), 1)
        events, t = [], 0.0
        for step in steps:
            events.append(
                {"t": round(t, 2), "type": "step_started", "stepId": step["id"], "data": {}}
            )
            if step["id"] in forbidden_steps:
                events.append(
                    {
                        "t": round(t + slot / 2, 2),
                        "type": "forbidden_action",
                        "stepId": step["id"],
                        "data": {},
                    }
                )
            t += slot * self.rng.uniform(0.7, 1.1)
            events.append(
                {"t": round(t, 2), "type": "step_completed", "stepId": step["id"], "data": {}}
            )
        return events

    def add_attempt(
        self,
        worker: Worker,
        kiosk: Kiosk,
        scenario_id: str,
        started_at: int,
        *,
        must_pass: bool | None = None,
        skill: float = 1.0,
        dishonest: bool = False,
    ) -> Attempt:
        """must_pass: True/False forces the outcome by re-rolling; None leaves it to chance."""
        content = self.content[scenario_id]
        variant = self.rng.choice(sorted(content.spec.variants))
        for _ in range(200):
            rules, forbidden = self._roll_rules(content, variant, skill)
            recheck = recheck_attempt(
                content.spec,
                variant,
                _rule_results(rules),
                [],
                reported_score=0,
                reported_passed=False,
                reported_critical_failures=[],
            )
            if must_pass is None or recheck.passed == must_pass:
                break
            skill = skill * 0.8 if must_pass else min(skill * 1.3 + 0.1, 3.0)
        duration = round(self.rng.uniform(150, 300), 1)
        attempt_id = self._id(started_at)
        result = {
            "attemptId": str(attempt_id),
            "scenarioId": scenario_id,
            "scenarioVersion": content.spec.version,
            "variant": variant,
            "seed": self.rng.randrange(2**31),
            "mode": "tabletop" if self.rng.random() < 0.15 else "ar",
            "startedAt": started_at,
            "durationSec": duration,
            "scorePercent": recheck.score_percent,
            "passed": recheck.passed or dishonest,  # a tampered client claims a pass
            "criticalFailures": [] if dishonest else recheck.critical_failures,
            "rules": rules,
            "eventsSha256": "0" * 64,
        }
        events = self._events(content, variant, forbidden, duration)
        final = recheck_attempt(
            content.spec,
            variant,
            _rule_results(rules),
            events,
            reported_score=result["scorePercent"],
            reported_passed=result["passed"],
            reported_critical_failures=result["criticalFailures"],
        )
        attempt = Attempt(
            id=attempt_id,
            worker_id=worker.id,
            device_id=kiosk.device.id,
            scenario_id=scenario_id,
            scenario_version=content.spec.version,
            variant=variant,
            seed=result["seed"],
            mode=result["mode"],
            started_at=started_at,
            duration_sec=duration,
            score_percent=final.score_percent,
            passed=final.passed,
            result_json=result,
            events_json=events,
            flagged=bool(final.reasons),
            flag_reason=final.flag_reason,
            received_at=started_at + self.rng.randrange(600, 3 * DAY),
        )
        self.session.add(attempt)
        self.summary.attempts += 1
        self.summary.flagged += attempt.flagged
        return attempt

    # --- certificates ---

    def add_certificate(
        self, worker: Worker, kiosk: Kiosk, passes: list[Attempt], iat: int, attestation: str
    ) -> Certificate:
        by_id = {a.scenario_id: a for a in passes}
        validity = min(self.content[s].spec.validity_days for s in REQUIRED)
        cid = self._id(iat)
        body = CertificateBody(
            cid=str(cid),
            wid=str(worker.id),
            wn=worker.display_name[:24],
            site=kiosk.site.code,
            mods=[ModuleScore(id=s, v=1, s=by_id[s].score_percent) for s in REQUIRED],
            iat=iat,
            exp=iat + validity * DAY,
            lang=worker.preferred_lang,
            att=attestation,
        )
        cert = Certificate(
            id=cid,
            worker_id=worker.id,
            device_id=kiosk.device.id,
            token=sign_token(Prefix.CERTIFICATE, body, kiosk.key),
            issued_at=body.iat,
            expires_at=body.exp,
            received_at=iat + self.rng.randrange(600, DAY),
        )
        self.session.add(cert)
        self.summary.certificates += 1
        return cert

    def certify(
        self, worker: Worker, kiosk: Kiosk, first_pass_at: int, attestation: str
    ) -> Certificate:
        fire = self.add_attempt(worker, kiosk, "FIRE_01", first_pass_at, must_pass=True, skill=0.5)
        gas_at = first_pass_at + self.rng.randrange(2, 30) * 3600
        gas = self.add_attempt(worker, kiosk, "GAS_01", gas_at, must_pass=True, skill=0.5)
        return self.add_certificate(worker, kiosk, [fire, gas], gas_at + 600, attestation)


async def seed(
    session: AsyncSession,
    *,
    catalog: ContentCatalog,
    content_dir: Path,
    root_key: Ed25519PrivateKey,
    now: int,
    rng_seed: int = 2026,
    admins: list[uuid.UUID] | None = None,
    supervisors: list[tuple[uuid.UUID, str]] | None = None,
) -> SeedSummary:
    if await session.scalar(select(Site).where(Site.code == SITES[0][0])) is not None:
        summary = SeedSummary()
        summary.notes.append("Demo sites already exist; nothing was changed.")
        return summary

    rng = random.Random(rng_seed)
    b = DemoBuilder(session, catalog, content_dir, root_key, now, rng)
    sites = b.add_sites()
    await session.flush()  # no ORM relationships: flush parents before rows that reference them
    kiosks = [b.add_kiosk(site, 1) for site in sites]
    b.add_pending_device(sites[2])
    await session.flush()

    names = b.names(40)
    # 12 due for recertification, 10 certified recently, 18 still training
    for i, name in enumerate(names):
        kiosk = kiosks[i % len(kiosks)]
        if i < 12:
            expires_in = rng.uniform(1.5, 29.5) * DAY
            issued = int(now + expires_in - 365 * DAY)
            first_pass = issued - rng.randrange(4, 30) * 3600 - 600
            worker = b.add_worker(name, kiosk, first_pass - rng.randrange(1, 10) * DAY)
            await session.flush()
            if rng.random() < 0.5:
                b.add_attempt(worker, kiosk, "GAS_01", worker.created_at + 3600, must_pass=False)
            # Issued about a year ago under the older attestation: expires within 30 days
            b.certify(worker, kiosk, first_pass, kiosk.old_attestation)
            b.summary.expiring_30d += 1
        elif i < 22:
            first_pass = now - rng.randrange(8, 110) * DAY
            worker = b.add_worker(name, kiosk, first_pass - rng.randrange(5, 15) * DAY)
            await session.flush()
            for _ in range(rng.randrange(1, 3)):
                started = worker.created_at + rng.randrange(1, 4) * DAY
                b.add_attempt(worker, kiosk, rng.choice(REQUIRED), started, must_pass=False)
            cert = b.certify(worker, kiosk, first_pass, kiosk.attestation)
            if i == 21:
                await session.flush()
                cert.revoked_at = now - 3 * DAY
                cert.revoked_reason = "Issued under the wrong worker ID (demo)"
                cert.revoked_by = admins[0] if admins else None
                b.summary.revoked += 1
        else:
            worker = b.add_worker(name, kiosk, now - rng.randrange(20, 95) * DAY)
            await session.flush()
            started = worker.created_at + DAY
            for n in range(rng.randrange(3, 7)):
                started = min(
                    started + rng.randrange(1, 12) * DAY, now - rng.randrange(1, 20) * 3600
                )
                scenario = REQUIRED[n % 2]
                # Two tampered clients claim a pass they didn't earn: flagged on the dashboard
                dishonest = i in (30, 36) and n == 0
                # GAS stays unpassed: once both modules pass, the device issues a certificate
                must_pass = False if scenario == "GAS_01" or dishonest else None
                b.add_attempt(
                    worker,
                    kiosk,
                    scenario,
                    started,
                    must_pass=must_pass,
                    skill=1.4,
                    dishonest=dishonest,
                )
    await session.flush()

    await publish_revocation_list(session, root_key, now)
    for user_id in admins or []:
        session.add(AdminProfile(user_id=user_id, role="admin", site_ids=[]))
    codes = {site.code: site.id for site in sites}
    for user_id, code in supervisors or []:
        session.add(AdminProfile(user_id=user_id, role="supervisor", site_ids=[codes[code]]))
    await session.commit()
    return b.summary


def _parse_supervisor(text: str) -> tuple[uuid.UUID, str]:
    user_id, _, code = text.partition(":")
    if code not in {c for c, *_ in SITES}:
        raise argparse.ArgumentTypeError(f"site must be one of {[c for c, *_ in SITES]}")
    return uuid.UUID(user_id), code


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.tools.seed_demo", description=__doc__)
    parser.add_argument(
        "--admin",
        type=uuid.UUID,
        action="append",
        default=[],
        metavar="USER_ID",
        help="Supabase auth uid to give the admin role (repeatable)",
    )
    parser.add_argument(
        "--supervisor",
        type=_parse_supervisor,
        action="append",
        default=[],
        metavar="USER_ID:SITE",
        help="Supabase auth uid + site code for a supervisor (repeatable)",
    )
    parser.add_argument("--seed", type=int, default=2026, help="random seed (default 2026)")
    args = parser.parse_args(argv)

    settings = get_settings()
    try:
        root_key = load_root_private_key(settings)
    except Exception as exc:  # message never contains the key
        print(f"Cannot load ROOT_SIGNING_KEY_B64: {exc}", file=sys.stderr)
        return 1

    async def run() -> SeedSummary:
        engine = create_engine(settings.database_url)
        try:
            async with create_sessionmaker(engine)() as session:
                return await seed(
                    session,
                    catalog=load_catalog(settings.content_dir),
                    content_dir=settings.content_dir,
                    root_key=root_key,
                    now=int(time.time()),
                    rng_seed=args.seed,
                    admins=args.admin,
                    supervisors=args.supervisor,
                )
        finally:
            await engine.dispose()

    summary = asyncio.run(run())
    for note in summary.notes:
        print(note)
    if not summary.notes:
        print(
            f"Seeded {summary.sites} sites, {summary.workers} workers, {summary.attempts} attempts "
            f"({summary.flagged} flagged), {summary.certificates} certificates "
            f"({summary.expiring_30d} expiring within 30 days, {summary.revoked} revoked), "
            f"{summary.pending_devices} pending device."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
