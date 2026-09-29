"""T-37: refresher drills on the server (docs/03 "Refresher drills", D-044).

The derivation must match the app's (`mobile/src/core/refresher/refresher.test.ts` asserts the same
step and rule ids), the sync recheck must score a refresher on its own rules, and the retention
endpoint compares initial training with each refresher stage.
"""

import json
import uuid
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.ids import uuid7
from app.db.models import Attempt, Device, Worker
from app.services.content import ContentCatalog
from app.services.refresher import refresher_scenario, refresher_step_ids
from tests.factories import (
    NOW,
    add_admin,
    add_device,
    add_site,
    add_worker,
    admin_token,
    attempt_result,
    bearer,
    latest_scenario,
    signed_headers,
)

pytestmark = pytest.mark.anyio

DAY = 86400


@pytest.fixture
def catalog(app: FastAPI) -> ContentCatalog:
    return app.state.catalog


# --- derivation (same expectations as the app) ---


def test_fire_refresher_matches_the_app(catalog: ContentCatalog) -> None:
    fire = latest_scenario(catalog, "FIRE_01")

    assert refresher_step_ids(fire) == [
        "place_fire",
        "raise_alarm",
        "pick_extinguisher",
        "extinguish",
        "escalation",
    ]
    short = refresher_scenario(fire)
    assert list(short.rules) == [
        "R_ALARM_BEFORE_FIGHT",
        "R_ALARM_FAST",
        "R_RIGHT_EXTINGUISHER",
        "R_AIM_BASE",
        "R_EVACUATE_DECISION",
    ]
    assert sum(r.points for r in short.rules.values()) == 60
    assert (short.id, short.version, short.pass_threshold_percent) == (fire.id, fire.version, 70)


def test_gas_refresher_matches_the_app(catalog: ContentCatalog) -> None:
    gas = latest_scenario(catalog, "GAS_01")

    assert refresher_step_ids(gas) == [
        "place_area",
        "ppe",
        "ignition_trap",
        "self_rescuer",
        "enter_or_retreat",
    ]
    assert list(refresher_scenario(gas).rules) == [
        "R_PPE",
        "R_NO_IGNITION",
        "R_SELF_RESCUER",
        "R_RETREAT_DECISION",
    ]


def test_catalog_reads_the_refresher_stages(catalog: ContentCatalog) -> None:
    assert catalog.refresher_due_days == (7, 30)


# --- sync ---


async def _sync(
    client: AsyncClient, device: Device, key: Ed25519PrivateKey, *items: dict[str, Any]
) -> dict[str, Any]:
    body = json.dumps({"items": list(items)}).encode()
    headers = signed_headers(key, device.id, "POST", "/v1/sync", body)
    headers["Content-Type"] = "application/json"
    return (await client.post("/v1/sync", content=body, headers=headers)).json()


def _refresher_item(
    catalog: ContentCatalog, worker_id: uuid.UUID, *, day: int | None = 7, **overrides: Any
) -> dict[str, Any]:
    attempt_id = uuid7()
    spec = refresher_scenario(latest_scenario(catalog, "FIRE_01"))
    result = attempt_result(spec, attempt_id, "ordinary", **overrides)
    result["kind"] = "refresher"
    if day is not None:
        result["refresher"] = {"dueDay": day}
    return {
        "kind": "attempt",
        "id": str(attempt_id),
        "payload": {"workerId": str(worker_id), "result": result, "events": []},
    }


async def test_honest_refresher_is_accepted_unflagged(
    client: AsyncClient, db: AsyncSession, catalog: ContentCatalog
) -> None:
    site = await add_site(db)
    key = Ed25519PrivateKey.generate()
    device = await add_device(db, site, key)
    worker = await add_worker(db, site)
    item = _refresher_item(catalog, worker.id, earned={"R_AIM_BASE": 7.5})
    assert item["payload"]["result"]["scorePercent"] == 88  # 52.5 / 60

    response = await _sync(client, device, key, item)

    assert response["accepted"] == [item["id"]]
    attempt = await db.get(Attempt, uuid.UUID(item["id"]))
    assert attempt is not None
    assert (attempt.score_percent, attempt.passed, attempt.flagged) == (88, True, False)
    assert attempt.result_json["refresher"] == {"dueDay": 7}


async def test_refresher_with_a_dropped_rule_or_missing_critical_rule_is_flagged(
    client: AsyncClient, db: AsyncSession, catalog: ContentCatalog
) -> None:
    site = await add_site(db)
    key = Ed25519PrivateKey.generate()
    device = await add_device(db, site, key)
    worker = await add_worker(db, site)
    item = _refresher_item(catalog, worker.id)
    rules = item["payload"]["result"]["rules"]
    # Claims a rule the refresher doesn't score, and leaves out a critical one
    rules.append({**rules[0], "ruleId": "R_EXIT_FOUND", "max": 10, "earned": 10})
    item["payload"]["result"]["rules"] = [r for r in rules if r["ruleId"] != "R_EVACUATE_DECISION"]

    await _sync(client, device, key, item)

    attempt = await db.get(Attempt, uuid.UUID(item["id"]))
    assert attempt is not None and attempt.flag_reason is not None
    assert "rule R_EXIT_FOUND is not scored in the scenario" in attempt.flag_reason
    assert "rule R_EVACUATE_DECISION missing" in attempt.flag_reason


@pytest.mark.parametrize(
    ("kind", "day"),
    [("refresher", None), ("training", 7), ("refresher", 0), ("drill", None)],
)
async def test_kind_and_stage_must_agree(
    client: AsyncClient, db: AsyncSession, catalog: ContentCatalog, kind: str, day: int | None
) -> None:
    site = await add_site(db)
    key = Ed25519PrivateKey.generate()
    device = await add_device(db, site, key)
    worker = await add_worker(db, site)
    item = _refresher_item(catalog, worker.id, day=day)
    item["payload"]["result"]["kind"] = kind

    response = await _sync(client, device, key, item)

    rejected = {"id": item["id"], "code": "invalid_payload", "retryable": False}
    assert response["rejected"] == [rejected]


# --- retention endpoint ---


def _row(
    worker: Worker,
    device: Device,
    scenario: str,
    at: int,
    *,
    score: int,
    passed: bool = True,
    rules: dict[str, tuple[float, int]] | None = None,
    day: int | None = None,
) -> Attempt:
    attempt_id = uuid7()
    result: dict[str, Any] = {
        "attemptId": str(attempt_id),
        "rules": [
            {"ruleId": r, "earned": e, "max": m, "critical": False, "passed": e == m}
            for r, (e, m) in (rules or {}).items()
        ],
    }
    if day is not None:
        result.update(kind="refresher", refresher={"dueDay": day})
    return Attempt(
        id=attempt_id,
        worker_id=worker.id,
        device_id=device.id,
        scenario_id=scenario,
        scenario_version=3,
        variant="ordinary",
        seed=1,
        mode="ar",
        started_at=at,
        duration_sec=100.0,
        score_percent=score,
        passed=passed,
        result_json=result,
        events_json=[],
        flagged=False,
        received_at=NOW,
    )


FULL_REFRESHER_RULES = {
    "R_ALARM_BEFORE_FIGHT": (10, 10),
    "R_ALARM_FAST": (5, 5),
    "R_RIGHT_EXTINGUISHER": (15, 15),
    "R_AIM_BASE": (15, 15),
    "R_EVACUATE_DECISION": (15, 15),
}


async def test_retention_compares_initial_with_each_stage(
    client: AsyncClient, db: AsyncSession, jwt_key: ec.EllipticCurvePrivateKey
) -> None:
    dhn, jsr = await add_site(db, "DHN-01"), await add_site(db, "JSR-02", "steel")
    kiosk_d, kiosk_j = await add_device(db, dhn), await add_device(db, jsr)
    ravi = await add_worker(db, dhn, name="Ravi Munda")
    sita = await add_worker(db, dhn, name="Sita Hembrom")
    amit = await add_worker(db, jsr, name="Amit Oraon")
    t0 = NOW - 60 * DAY
    db.add_all(
        [
            # Ravi: a failed run first (not the initial), then a pass that lost only
            # R_EXIT_FOUND, which the refresher doesn't score -> 100 on the refresher's rules
            _row(ravi, kiosk_d, "FIRE_01", t0 - DAY, score=50, passed=False),
            _row(
                ravi,
                kiosk_d,
                "FIRE_01",
                t0,
                score=90,
                rules={**FULL_REFRESHER_RULES, "R_EXIT_FOUND": (0, 10)},
            ),
            _row(ravi, kiosk_d, "FIRE_01", t0 + 8 * DAY, score=80, day=7),
            _row(ravi, kiosk_d, "FIRE_01", t0 + 9 * DAY, score=100, day=7),  # not the first
            _row(ravi, kiosk_d, "FIRE_01", t0 + 31 * DAY, score=70, day=30),
            # Sita: half points on the hold -> 52.5 / 60 = 88 on the refresher's rules
            _row(
                sita,
                kiosk_d,
                "FIRE_01",
                t0,
                score=93,
                rules={**FULL_REFRESHER_RULES, "R_AIM_BASE": (7.5, 15)},
            ),
            _row(sita, kiosk_d, "FIRE_01", t0 + 8 * DAY, score=90, day=7),
            # Amit (JSR-02): only a refresher
            _row(amit, kiosk_j, "FIRE_01", t0 + 8 * DAY, score=40, day=7),
        ]
    )
    await db.commit()
    admin = bearer(admin_token(jwt_key, await add_admin(db)))
    supervisor = bearer(admin_token(jwt_key, await add_admin(db, "supervisor", [dhn.id])))

    body = (await client.get("/v1/admin/retention", headers=admin)).json()

    assert body["stages"] == [0, 7, 30]
    assert body["scenarios"] == [
        {
            "scenarioId": "FIRE_01",
            "points": [
                {"stage": 0, "avgScore": 94, "workers": 2},
                {"stage": 7, "avgScore": 70, "workers": 3},
                {"stage": 30, "avgScore": 70, "workers": 1},
            ],
        },
        {
            "scenarioId": "GAS_01",
            "points": [
                {"stage": 0, "avgScore": None, "workers": 0},
                {"stage": 7, "avgScore": None, "workers": 0},
                {"stage": 30, "avgScore": None, "workers": 0},
            ],
        },
    ]
    scoped = (await client.get("/v1/admin/retention", headers=supervisor)).json()
    assert scoped["scenarios"][0]["points"][1] == {"stage": 7, "avgScore": 85, "workers": 2}


async def test_retention_needs_a_token(client: AsyncClient) -> None:
    assert (await client.get("/v1/admin/retention")).status_code == 401
