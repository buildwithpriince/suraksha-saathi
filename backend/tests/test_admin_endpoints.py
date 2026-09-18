"""T-55: admin endpoints (docs/06 table, shapes in D-025) with supervisor site scoping."""

import csv
import io
import uuid
from dataclasses import dataclass
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.ids import uuid7
from app.db.models import Attempt, Certificate, Device, Site, Worker
from tests.factories import NOW, add_admin, add_device, add_site, add_worker, admin_token, bearer

pytestmark = pytest.mark.anyio

DAY = 86400


@dataclass
class World:
    """DHN-01: Ravi (valid cert), Sita (expiring + an old revoked cert), Nobody (no cert).
    JSR-02: Amit (expiring cert, flagged attempt). A supervisor sees only DHN-01."""

    dhn: Site
    jsr: Site
    ravi: Worker
    sita: Worker
    nobody: Worker
    amit: Worker
    attempts: dict[str, Attempt]
    certs: dict[str, Certificate]
    pending_device: Device
    admin: dict[str, str]
    supervisor: dict[str, str]


async def add_attempt(
    db: AsyncSession,
    worker: Worker,
    device: Device,
    scenario: str,
    *,
    passed: bool,
    started_at: int,
    failed_rules: tuple[str, ...] = (),
    flag_reason: str | None = None,
) -> Attempt:
    attempt_id = uuid7()
    rules = [
        {"ruleId": r, "earned": 0, "max": 15, "critical": False, "passed": False}
        for r in failed_rules
    ]
    attempt = Attempt(
        id=attempt_id,
        worker_id=worker.id,
        device_id=device.id,
        scenario_id=scenario,
        scenario_version=1,
        variant="minor" if scenario == "GAS_01" else "ordinary",
        seed=7,
        mode="ar",
        started_at=started_at,
        duration_sec=200.5,
        score_percent=100 if passed else 60,
        passed=passed,
        result_json={"attemptId": str(attempt_id), "rules": rules},
        events_json=[{"t": 1.0, "type": "step_started", "stepId": "s1"}],
        flagged=flag_reason is not None,
        flag_reason=flag_reason,
        received_at=NOW,
    )
    db.add(attempt)
    await db.commit()
    return attempt


async def add_cert(
    db: AsyncSession,
    worker: Worker,
    device: Device,
    *,
    expires_in_days: float,
    revoked: bool = False,
) -> Certificate:
    cert = Certificate(
        id=uuid7(),
        worker_id=worker.id,
        device_id=device.id,
        token=f"SS1.{worker.display_name.replace(' ', '')}.sig",
        issued_at=NOW - 100 * DAY,
        expires_at=NOW + int(expires_in_days * DAY),
        revoked_at=NOW - DAY if revoked else None,
        revoked_reason="test" if revoked else None,
        received_at=NOW,
    )
    db.add(cert)
    await db.commit()
    return cert


@pytest.fixture
async def world(db: AsyncSession, jwt_key: ec.EllipticCurvePrivateKey) -> World:
    dhn = await add_site(db, "DHN-01", "coal", name="Dhanbad Colliery")
    jsr = await add_site(db, "JSR-02", "steel", name="Jamshedpur Steel")
    kiosk_d, kiosk_j = await add_device(db, dhn), await add_device(db, jsr)
    pending = await add_device(db, dhn, status="pending")
    ravi = await add_worker(db, dhn, name="Ravi Munda")
    sita = await add_worker(db, dhn, name="Sita Hembrom")
    nobody = await add_worker(db, dhn, name="Nobody Tudu")
    amit = await add_worker(db, jsr, name="Amit Oraon")
    attempts = {
        "ravi_fire": await add_attempt(
            db, ravi, kiosk_d, "FIRE_01", passed=True, started_at=NOW - 1 * DAY
        ),
        "ravi_gas": await add_attempt(
            db,
            ravi,
            kiosk_d,
            "GAS_01",
            passed=False,
            started_at=NOW - 2 * DAY,
            failed_rules=("R_BUDDY_CHECK",),
        ),
        "sita_gas": await add_attempt(
            db,
            sita,
            kiosk_d,
            "GAS_01",
            passed=False,
            started_at=NOW - 10 * DAY,
            failed_rules=("R_BUDDY_CHECK", "R_REPORT"),
        ),
        "amit_fire": await add_attempt(
            db,
            amit,
            kiosk_j,
            "FIRE_01",
            passed=True,
            started_at=NOW - 3 * DAY,
            flag_reason="scorePercent 100, server computed 90",
        ),
    }
    certs = {
        "ravi": await add_cert(db, ravi, kiosk_d, expires_in_days=200),
        "sita": await add_cert(db, sita, kiosk_d, expires_in_days=10.5),
        "sita_old": await add_cert(db, sita, kiosk_d, expires_in_days=300, revoked=True),
        "amit": await add_cert(db, amit, kiosk_j, expires_in_days=5.5),
    }
    admin = bearer(admin_token(jwt_key, await add_admin(db)))
    supervisor = bearer(admin_token(jwt_key, await add_admin(db, "supervisor", [dhn.id])))
    return World(dhn, jsr, ravi, sita, nobody, amit, attempts, certs, pending, admin, supervisor)


GET_ROUTES = [
    "/v1/admin/overview",
    "/v1/admin/sites",
    "/v1/admin/compliance/heatmap",
    "/v1/admin/workers",
    "/v1/admin/attempts",
    "/v1/admin/certificates",
    "/v1/admin/recert-due",
    "/v1/admin/devices",
    "/v1/admin/export/attempts.csv",
]


@pytest.mark.parametrize("path", GET_ROUTES)
async def test_every_admin_route_needs_a_token(client: AsyncClient, path: str) -> None:
    response = await client.get(path)

    assert response.status_code == 401


# --- overview, sites, heatmap ---


async def test_overview_for_admin(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/overview", headers=world.admin)

    assert response.status_code == 200
    assert response.json() == {
        "workers": 4,
        "certifiedPercent": 75,  # Ravi valid, Sita + Amit expiring, Nobody none
        "attempts7d": 3,  # Sita's attempt is 10 days old
        "recertDue30d": 2,  # Sita, Amit
        "topFailedRules": [
            {"ruleId": "R_BUDDY_CHECK", "scenarioId": "GAS_01", "failures": 2},
            {"ruleId": "R_REPORT", "scenarioId": "GAS_01", "failures": 1},
        ],
    }


async def test_overview_for_a_supervisor_is_site_scoped(client: AsyncClient, world: World) -> None:
    body = (await client.get("/v1/admin/overview", headers=world.supervisor)).json()

    assert (
        body["workers"],
        body["certifiedPercent"],
        body["attempts7d"],
        body["recertDue30d"],
    ) == (
        3,
        67,  # 2 of 3, rounded half away from zero
        2,
        1,
    )


async def test_sites_list(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/sites", headers=world.admin)

    assert response.json() == [
        {
            "id": str(world.dhn.id),
            "code": "DHN-01",
            "name": "Dhanbad Colliery",
            "district": "Dhanbad",
            "sector": "coal",
            "workers": 3,
            "certifiedPercent": 67,
        },
        {
            "id": str(world.jsr.id),
            "code": "JSR-02",
            "name": "Jamshedpur Steel",
            "district": "Dhanbad",
            "sector": "steel",
            "workers": 1,
            "certifiedPercent": 100,
        },
    ]
    supervised = await client.get("/v1/admin/sites", headers=world.supervisor)
    assert [s["code"] for s in supervised.json()] == ["DHN-01"]


async def test_heatmap_has_every_cell(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/compliance/heatmap", headers=world.admin)

    assert response.json() == {
        "sites": ["DHN-01", "JSR-02"],
        "scenarios": ["FIRE_01", "GAS_01"],
        "cells": [
            {"site": "DHN-01", "scenario": "FIRE_01", "passRate": 100, "attempts": 1},
            {"site": "DHN-01", "scenario": "GAS_01", "passRate": 0, "attempts": 2},
            {"site": "JSR-02", "scenario": "FIRE_01", "passRate": 100, "attempts": 1},
            {"site": "JSR-02", "scenario": "GAS_01", "passRate": None, "attempts": 0},
        ],
    }
    supervised = (await client.get("/v1/admin/compliance/heatmap", headers=world.supervisor)).json()
    assert supervised["sites"] == ["DHN-01"]
    assert {cell["site"] for cell in supervised["cells"]} == {"DHN-01"}


# --- workers ---


async def test_workers_list(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/workers", headers=world.admin)

    assert response.json() == {
        "items": [
            {
                "id": str(world.amit.id),
                "displayName": "Amit Oraon",
                "site": "JSR-02",
                "certStatus": "expiring",
                "lastAttemptAt": NOW - 3 * DAY,
            },
            {
                "id": str(world.nobody.id),
                "displayName": "Nobody Tudu",
                "site": "DHN-01",
                "certStatus": "none",
                "lastAttemptAt": None,
            },
            {
                "id": str(world.ravi.id),
                "displayName": "Ravi Munda",
                "site": "DHN-01",
                "certStatus": "valid",
                "lastAttemptAt": NOW - 1 * DAY,
            },
            {
                "id": str(world.sita.id),
                "displayName": "Sita Hembrom",
                "site": "DHN-01",
                "certStatus": "expiring",  # best of expiring + revoked
                "lastAttemptAt": NOW - 10 * DAY,
            },
        ],
        "total": 4,
    }


@pytest.mark.parametrize(
    ("params", "names"),
    [
        ({"q": "munda"}, ["Ravi Munda"]),
        ({"site": "JSR-02"}, ["Amit Oraon"]),
        ({"site": "DHN-01", "q": "o"}, ["Nobody Tudu", "Sita Hembrom"]),
        ({"site": "NOPE-9"}, []),
    ],
)
async def test_workers_search_and_site_filter(
    client: AsyncClient, world: World, params: dict[str, str], names: list[str]
) -> None:
    body = (await client.get("/v1/admin/workers", params=params, headers=world.admin)).json()

    assert [item["displayName"] for item in body["items"]] == names
    assert body["total"] == len(names)


async def test_supervisor_sees_only_their_workers(client: AsyncClient, world: World) -> None:
    body = (await client.get("/v1/admin/workers", headers=world.supervisor)).json()

    assert body["total"] == 3
    assert "Amit Oraon" not in [item["displayName"] for item in body["items"]]
    other_site = await client.get(
        "/v1/admin/workers", params={"site": "JSR-02"}, headers=world.supervisor
    )
    assert other_site.json() == {"items": [], "total": 0}


async def test_workers_are_paged_25_at_a_time(
    client: AsyncClient, db: AsyncSession, world: World
) -> None:
    for n in range(30):
        await add_worker(db, world.dhn, name=f"Worker {n:02d}")

    first = (await client.get("/v1/admin/workers", headers=world.admin)).json()
    second = (await client.get("/v1/admin/workers?page=2", headers=world.admin)).json()

    assert (len(first["items"]), len(second["items"])) == (25, 9)
    assert first["total"] == second["total"] == 34
    bad_page = await client.get("/v1/admin/workers?page=0", headers=world.admin)
    assert bad_page.status_code == 422


async def test_worker_detail(client: AsyncClient, world: World) -> None:
    response = await client.get(f"/v1/admin/workers/{world.sita.id}", headers=world.admin)

    body = response.json()
    assert {k: v for k, v in body.items() if k not in ("attempts", "certificates")} == {
        "id": str(world.sita.id),
        "displayName": "Sita Hembrom",
        "employeeCode": None,
        "site": "DHN-01",
        "preferredLang": "hi",
        "certStatus": "expiring",
        "createdAt": NOW - 500,
    }
    assert [a["id"] for a in body["attempts"]] == [str(world.attempts["sita_gas"].id)]
    assert {c["status"] for c in body["certificates"]} == {"expiring", "revoked"}
    assert body["certificates"][0]["token"].startswith("SS1.")


async def test_worker_outside_scope_is_404(client: AsyncClient, world: World) -> None:
    response = await client.get(f"/v1/admin/workers/{world.amit.id}", headers=world.supervisor)

    assert response.status_code == 404


# --- attempts ---


async def test_attempts_list_newest_first(client: AsyncClient, world: World) -> None:
    body = (await client.get("/v1/admin/attempts", headers=world.admin)).json()

    assert body["total"] == 4
    assert [item["id"] for item in body["items"]] == [
        str(world.attempts[key].id) for key in ("ravi_fire", "ravi_gas", "amit_fire", "sita_gas")
    ]
    assert body["items"][0] == {
        "id": str(world.attempts["ravi_fire"].id),
        "workerId": str(world.ravi.id),
        "workerName": "Ravi Munda",
        "site": "DHN-01",
        "scenarioId": "FIRE_01",
        "variant": "ordinary",
        "mode": "ar",
        "scorePercent": 100,
        "passed": True,
        "flagged": False,
        "startedAt": NOW - DAY,
    }


@pytest.mark.parametrize(
    ("params", "keys"),
    [
        ({"scenario": "GAS_01"}, ["ravi_gas", "sita_gas"]),
        ({"passed": "true"}, ["ravi_fire", "amit_fire"]),
        ({"flagged": "true"}, ["amit_fire"]),
        ({"site": "DHN-01", "scenario": "GAS_01", "passed": "false"}, ["ravi_gas", "sita_gas"]),
    ],
)
async def test_attempts_filters(
    client: AsyncClient, world: World, params: dict[str, str], keys: list[str]
) -> None:
    body = (await client.get("/v1/admin/attempts", params=params, headers=world.admin)).json()

    assert [item["id"] for item in body["items"]] == [str(world.attempts[k].id) for k in keys]


async def test_attempt_detail_has_result_events_and_flag(client: AsyncClient, world: World) -> None:
    attempt = world.attempts["amit_fire"]

    body = (await client.get(f"/v1/admin/attempts/{attempt.id}", headers=world.admin)).json()

    assert body["flagReason"] == "scorePercent 100, server computed 90"
    assert body["durationSec"] == 200.5
    assert body["result"] == attempt.result_json
    assert body["events"] == attempt.events_json
    assert body["flagged"] is True


async def test_attempt_outside_scope_is_404(client: AsyncClient, world: World) -> None:
    attempt = world.attempts["amit_fire"]

    response = await client.get(f"/v1/admin/attempts/{attempt.id}", headers=world.supervisor)

    assert response.status_code == 404


# --- certificates and recertification ---


@pytest.mark.parametrize(
    ("status", "keys"),
    [
        (None, {"ravi", "sita", "sita_old", "amit"}),
        ("valid", {"ravi"}),
        ("expiring", {"sita", "amit"}),
        ("revoked", {"sita_old"}),
        ("expired", set()),
    ],
)
async def test_certificates_status_filter(
    client: AsyncClient, world: World, status: str | None, keys: set[str]
) -> None:
    params = {"status": status} if status else {}

    body = (await client.get("/v1/admin/certificates", params=params, headers=world.admin)).json()

    assert {item["id"] for item in body["items"]} == {str(world.certs[k].id) for k in keys}
    assert body["total"] == len(keys)


async def test_certificate_item_shape(client: AsyncClient, world: World) -> None:
    body = (await client.get("/v1/admin/certificates?status=valid", headers=world.admin)).json()

    assert body["items"] == [
        {
            "id": str(world.certs["ravi"].id),
            "worker": {"id": str(world.ravi.id), "displayName": "Ravi Munda", "site": "DHN-01"},
            "issuedAt": NOW - 100 * DAY,
            "expiresAt": NOW + 200 * DAY,
            "status": "valid",
            "revokedAt": None,
            "revokedReason": None,
        }
    ]


async def test_unknown_certificate_status_is_422(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/certificates?status=lost", headers=world.admin)

    assert response.status_code == 422


async def test_recert_due(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/recert-due", headers=world.admin)

    assert response.json() == [
        {
            "workerId": str(world.amit.id),
            "displayName": "Amit Oraon",
            "site": "JSR-02",
            "expiresAt": NOW + int(5.5 * DAY),
            "daysLeft": 5,
        },
        {
            "workerId": str(world.sita.id),
            "displayName": "Sita Hembrom",
            "site": "DHN-01",
            "expiresAt": NOW + int(10.5 * DAY),
            "daysLeft": 10,
        },
    ]
    narrow = await client.get("/v1/admin/recert-due?days=7", headers=world.admin)
    assert [item["displayName"] for item in narrow.json()] == ["Amit Oraon"]
    scoped = await client.get("/v1/admin/recert-due", headers=world.supervisor)
    assert [item["displayName"] for item in scoped.json()] == ["Sita Hembrom"]


async def test_recertified_worker_is_not_due(
    client: AsyncClient, db: AsyncSession, world: World
) -> None:
    await add_cert(db, world.amit, await add_device(db, world.jsr), expires_in_days=365)

    body = (await client.get("/v1/admin/recert-due", headers=world.admin)).json()

    assert [item["displayName"] for item in body] == ["Sita Hembrom"]


async def test_expired_certificate_is_not_due(
    client: AsyncClient, db: AsyncSession, world: World
) -> None:
    lapsed = await add_worker(db, world.dhn, name="Lapsed Kisku")
    await add_cert(db, lapsed, await add_device(db, world.dhn), expires_in_days=-2)

    body = (await client.get("/v1/admin/recert-due", headers=world.admin)).json()

    assert "Lapsed Kisku" not in [item["displayName"] for item in body]


# --- devices ---


async def test_devices_list_and_pending_filter(client: AsyncClient, world: World) -> None:
    everything = (await client.get("/v1/admin/devices", headers=world.admin)).json()
    pending = (await client.get("/v1/admin/devices?status=pending", headers=world.admin)).json()

    assert len(everything) == 3
    assert pending == [
        {
            "id": str(world.pending_device.id),
            "label": "Kiosk tablet 1",
            "site": "DHN-01",
            "status": "pending",
            "lastSeenAt": None,
            "approvedAt": None,
        }
    ]


async def test_supervisor_cannot_list_devices(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/devices", headers=world.supervisor)

    assert response.status_code == 403


# --- CSV export ---


def _csv(text: str) -> list[dict[str, Any]]:
    return list(csv.DictReader(io.StringIO(text)))


async def test_csv_export(client: AsyncClient, world: World) -> None:
    response = await client.get("/v1/admin/export/attempts.csv", headers=world.admin)

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert "attachment" in response.headers["content-disposition"]
    header = response.text.splitlines()[0]
    assert header == (
        "attempt_id,worker_id,worker_name,site,scenario_id,scenario_version,variant,mode,"
        "score_percent,passed,flagged,flag_reason,started_at"
    )
    rows = _csv(response.text)
    assert [row["attempt_id"] for row in rows] == [
        str(world.attempts[k].id) for k in ("sita_gas", "amit_fire", "ravi_gas", "ravi_fire")
    ]
    amit = rows[1]
    assert (amit["worker_name"], amit["site"], amit["passed"], amit["flagged"]) == (
        "Amit Oraon",
        "JSR-02",
        "true",
        "true",
    )
    assert amit["started_at"] == "2026-09-08T04:13:20Z"  # NOW - 3 days, UTC


async def test_csv_filters_and_scope(client: AsyncClient, world: World) -> None:
    window = {"from": str(NOW - 2 * DAY), "to": str(NOW - DAY)}

    in_window = _csv(
        (await client.get("/v1/admin/export/attempts.csv", params=window, headers=world.admin)).text
    )
    jsr = _csv(
        (
            await client.get(
                "/v1/admin/export/attempts.csv", params={"site": "JSR-02"}, headers=world.admin
            )
        ).text
    )
    scoped = _csv(
        (await client.get("/v1/admin/export/attempts.csv", headers=world.supervisor)).text
    )

    assert {row["attempt_id"] for row in in_window} == {
        str(world.attempts["ravi_gas"].id),
        str(world.attempts["ravi_fire"].id),
    }
    assert [row["worker_name"] for row in jsr] == ["Amit Oraon"]
    assert {row["site"] for row in scoped} == {"DHN-01"}


async def test_csv_neutralises_formulas(
    client: AsyncClient, db: AsyncSession, world: World
) -> None:
    sneaky = await add_worker(db, world.dhn, name="=HYPERLINK(1)")
    await add_attempt(
        db, sneaky, await add_device(db, world.dhn), "FIRE_01", passed=True, started_at=NOW
    )

    rows = _csv((await client.get("/v1/admin/export/attempts.csv", headers=world.admin)).text)

    assert rows[-1]["worker_name"] == "'=HYPERLINK(1)"


async def test_unknown_uuid_paths_are_404(client: AsyncClient, world: World) -> None:
    for path in (f"/v1/admin/workers/{uuid.uuid4()}", f"/v1/admin/attempts/{uuid.uuid4()}"):
        assert (await client.get(path, headers=world.admin)).status_code == 404
