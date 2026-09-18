"""T-53: POST /v1/sync ingest (docs/05 "Sync ingest rules", docs/06, D-022)."""

import json
import uuid
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.ids import uuid7
from app.db.models import Attempt, Certificate, Device, Site, Worker
from app.services.content import ContentCatalog
from tests.factories import (
    NOW,
    add_device,
    add_site,
    add_worker,
    attempt_result,
    attestation_for,
    certificate_token,
    signed_headers,
)

pytestmark = pytest.mark.anyio

SYNC = "/v1/sync"


class Kiosk:
    """An approved device at DHN-01 that signs its sync requests."""

    def __init__(self, client: AsyncClient, device: Device, key: Ed25519PrivateKey) -> None:
        self.client, self.device, self.key = client, device, key

    async def sync(self, *items: dict[str, Any]) -> Response:
        body = json.dumps({"items": list(items)}).encode()
        headers = signed_headers(self.key, self.device.id, "POST", SYNC, body)
        headers["Content-Type"] = "application/json"
        return await self.client.post(SYNC, content=body, headers=headers)


@pytest.fixture
async def site(db: AsyncSession) -> Site:
    return await add_site(db)


@pytest.fixture
def device_key() -> Ed25519PrivateKey:  # type: ignore[override]
    return Ed25519PrivateKey.generate()


@pytest.fixture
async def kiosk(
    client: AsyncClient, db: AsyncSession, site: Site, device_key: Ed25519PrivateKey
) -> Kiosk:
    return Kiosk(client, await add_device(db, site, device_key), device_key)


@pytest.fixture
def catalog(app: FastAPI) -> ContentCatalog:
    return app.state.catalog


def worker_item(worker_id: uuid.UUID, **payload: Any) -> dict[str, Any]:
    body = {
        "displayName": "Ravi Munda",
        "employeeCode": None,
        "siteCode": "DHN-01",
        "preferredLang": "hi",
        "updatedAt": NOW - 100,
    }
    body.update(payload)
    return {"kind": "worker", "id": str(worker_id), "payload": body}


def attempt_item(
    catalog: ContentCatalog,
    worker_id: uuid.UUID,
    attempt_id: uuid.UUID | None = None,
    *,
    scenario: str = "FIRE_01",
    variant: str = "ordinary",
    events: list[dict[str, Any]] | None = None,
    earned: dict[str, float] | None = None,
    **overrides: Any,
) -> dict[str, Any]:
    attempt_id = attempt_id or uuid7()
    spec = catalog.scenario(scenario, 1)
    assert spec is not None
    result = attempt_result(spec, attempt_id, variant, earned=earned, **overrides)
    return {
        "kind": "attempt",
        "id": str(attempt_id),
        "payload": {"workerId": str(worker_id), "result": result, "events": events or []},
    }


def certificate_item(cid: uuid.UUID, worker_id: uuid.UUID, token: str) -> dict[str, Any]:
    return {
        "kind": "certificate",
        "id": str(cid),
        "payload": {"workerId": str(worker_id), "token": token},
    }


async def count(db: AsyncSession, model: type) -> int:
    return (await db.scalar(select(func.count()).select_from(model))) or 0


# --- workers ---


async def test_new_worker_is_stored_at_the_device_site(
    kiosk: Kiosk, db: AsyncSession, site: Site
) -> None:
    worker_id = uuid7()

    response = await kiosk.sync(worker_item(worker_id, employeeCode="E-17"))

    assert response.status_code == 200
    assert response.json() == {"accepted": [str(worker_id)], "rejected": []}
    worker = await db.get(Worker, worker_id)
    assert worker is not None
    assert (worker.site_id, worker.display_name, worker.employee_code, worker.preferred_lang) == (
        site.id,
        "Ravi Munda",
        "E-17",
        "hi",
    )
    assert (worker.created_by_device_id, worker.created_at, worker.updated_at) == (
        kiosk.device.id,
        NOW,
        NOW - 100,
    )


async def test_newer_worker_update_wins(kiosk: Kiosk, db: AsyncSession) -> None:
    worker_id = uuid7()
    await kiosk.sync(worker_item(worker_id))

    response = await kiosk.sync(worker_item(worker_id, displayName="Ravi K. Munda", updatedAt=NOW))

    assert response.json()["accepted"] == [str(worker_id)]
    worker = await db.get(Worker, worker_id)
    await db.refresh(worker)
    assert worker is not None
    assert (worker.display_name, worker.updated_at) == ("Ravi K. Munda", NOW)


async def test_older_worker_update_is_accepted_but_ignored(kiosk: Kiosk, db: AsyncSession) -> None:
    worker_id = uuid7()
    await kiosk.sync(worker_item(worker_id, updatedAt=NOW))

    response = await kiosk.sync(worker_item(worker_id, displayName="Stale", updatedAt=NOW - 999))

    assert response.json() == {"accepted": [str(worker_id)], "rejected": []}
    worker = await db.get(Worker, worker_id)
    await db.refresh(worker)
    assert worker is not None
    assert worker.display_name == "Ravi Munda"


async def test_worker_for_another_site_is_invalid(kiosk: Kiosk, db: AsyncSession) -> None:
    await add_site(db, code="JSR-02", sector="steel")
    worker_id = uuid7()

    response = await kiosk.sync(worker_item(worker_id, siteCode="JSR-02"))

    assert response.json() == {
        "accepted": [],
        "rejected": [{"id": str(worker_id), "code": "invalid_payload", "retryable": False}],
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"displayName": ""},
        {"updatedAt": "1789000000"},  # strict: a string is not an integer
        {"updatedAt": True},
        {"preferredLang": "Hindi"},
    ],
)
async def test_bad_worker_payload_is_rejected_without_blocking_the_batch(
    kiosk: Kiosk, payload: dict[str, Any]
) -> None:
    bad, good = uuid7(), uuid7()

    response = await kiosk.sync(worker_item(bad, **payload), worker_item(good))

    assert response.json() == {
        "accepted": [str(good)],
        "rejected": [{"id": str(bad), "code": "invalid_payload", "retryable": False}],
    }


async def test_item_id_that_is_not_a_uuid_is_invalid(kiosk: Kiosk) -> None:
    item = worker_item(uuid7())
    item["id"] = "worker-1"

    response = await kiosk.sync(item)

    assert response.json()["rejected"] == [
        {"id": "worker-1", "code": "invalid_payload", "retryable": False}
    ]


# --- attempts ---


async def test_worker_and_attempt_in_one_batch(
    kiosk: Kiosk, db: AsyncSession, catalog: ContentCatalog
) -> None:
    worker_id, attempt_id = uuid7(), uuid7()

    response = await kiosk.sync(
        worker_item(worker_id), attempt_item(catalog, worker_id, attempt_id)
    )

    assert response.json() == {"accepted": [str(worker_id), str(attempt_id)], "rejected": []}
    attempt = await db.get(Attempt, attempt_id)
    assert attempt is not None
    assert (attempt.score_percent, attempt.passed, attempt.flagged, attempt.flag_reason) == (
        100,
        True,
        False,
        None,
    )
    assert (attempt.worker_id, attempt.device_id, attempt.scenario_id, attempt.variant) == (
        worker_id,
        kiosk.device.id,
        "FIRE_01",
        "ordinary",
    )
    assert (attempt.mode, attempt.seed, attempt.started_at, attempt.received_at) == (
        "ar",
        123456,
        NOW - 600,
        NOW,
    )


async def test_attempt_for_unknown_worker_is_retryable(
    kiosk: Kiosk, catalog: ContentCatalog
) -> None:
    attempt = attempt_item(catalog, uuid7())

    response = await kiosk.sync(attempt)

    assert response.json()["rejected"] == [
        {"id": attempt["id"], "code": "missing_worker", "retryable": True}
    ]


async def test_resending_a_batch_does_not_duplicate(
    kiosk: Kiosk, db: AsyncSession, catalog: ContentCatalog
) -> None:
    worker_id = uuid7()
    batch = [worker_item(worker_id), attempt_item(catalog, worker_id)]
    first = await kiosk.sync(*batch)

    second = await kiosk.sync(*batch)

    assert second.json() == first.json()
    assert len(second.json()["accepted"]) == 2
    assert await count(db, Worker) == 1
    assert await count(db, Attempt) == 1


async def test_same_attempt_id_with_different_content_is_conflict_immutable(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    worker = await add_worker(db, site)
    attempt_id = uuid7()
    await kiosk.sync(attempt_item(catalog, worker.id, attempt_id))

    changed = attempt_item(catalog, worker.id, attempt_id, earned={"R_ALARM_FAST": 0})
    response = await kiosk.sync(changed)

    assert response.json()["rejected"] == [
        {"id": str(attempt_id), "code": "conflict_immutable", "retryable": False}
    ]
    stored = await db.get(Attempt, attempt_id)
    assert stored is not None
    assert stored.score_percent == 100


async def test_client_claiming_a_pass_after_a_critical_failure_is_flagged(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    """docs/03 test 2: alarm after extinguishing fails critically even with score >= 70."""
    worker = await add_worker(db, site)
    item = attempt_item(catalog, worker.id, earned={"R_ALARM_BEFORE_FIGHT": 0})
    item["payload"]["result"].update(passed=True, criticalFailures=[])  # dishonest client
    item["payload"]["result"]["rules"][0]["passed"] = True

    response = await kiosk.sync(item)

    assert response.json()["accepted"] == [item["id"]]
    attempt = await db.get(Attempt, uuid.UUID(item["id"]))
    assert attempt is not None
    assert (attempt.score_percent, attempt.passed, attempt.flagged) == (90, False, True)
    assert attempt.flag_reason is not None
    assert "R_ALARM_BEFORE_FIGHT earned 0 but was reported passed" in attempt.flag_reason
    assert "passed true, server computed false" in attempt.flag_reason
    assert attempt.result_json["passed"] is True  # the device's claim is kept as sent


async def test_inflated_score_is_flagged_and_the_server_score_is_stored(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    worker = await add_worker(db, site)
    item = attempt_item(catalog, worker.id, earned={"R_EXIT_FOUND": 0}, scorePercent=100)

    await kiosk.sync(item)

    attempt = await db.get(Attempt, uuid.UUID(item["id"]))
    assert attempt is not None
    assert (attempt.score_percent, attempt.flagged) == (90, True)
    assert attempt.flag_reason == "scorePercent 100, server computed 90"


async def test_half_points_round_half_away_from_zero(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    """Hold rule at half points: 92.5 -> 93 (banker's rounding would give 92), D-022."""
    worker = await add_worker(db, site)
    item = attempt_item(catalog, worker.id, earned={"R_AIM_BASE": 7.5})
    assert item["payload"]["result"]["scorePercent"] == 93

    await kiosk.sync(item)

    attempt = await db.get(Attempt, uuid.UUID(item["id"]))
    assert attempt is not None
    assert (attempt.score_percent, attempt.flagged) == (93, False)


async def test_aborted_attempt_never_passes(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    worker = await add_worker(db, site)
    item = attempt_item(
        catalog, worker.id, events=[{"t": 30.0, "type": "attempt_aborted", "data": {}}]
    )
    item["payload"]["result"]["passed"] = False  # what an honest engine reports (docs/03)

    await kiosk.sync(item)

    attempt = await db.get(Attempt, uuid.UUID(item["id"]))
    assert attempt is not None
    assert (attempt.score_percent, attempt.passed, attempt.flagged) == (100, False, False)


async def test_variant_scoped_rules_are_skipped(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    """docs/03 test 7: GAS_01 minor skips the self-rescuer rules."""
    worker = await add_worker(db, site)
    item = attempt_item(catalog, worker.id, scenario="GAS_01", variant="minor")
    rule_ids = {rule["ruleId"] for rule in item["payload"]["result"]["rules"]}
    assert "R_SELF_RESCUER" not in rule_ids

    await kiosk.sync(item)

    attempt = await db.get(Attempt, uuid.UUID(item["id"]))
    assert attempt is not None
    assert (attempt.score_percent, attempt.passed, attempt.flagged) == (100, True, False)


async def test_unknown_scenario_version_is_rejected(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    worker = await add_worker(db, site)
    item = attempt_item(catalog, worker.id, scenarioVersion=99)

    response = await kiosk.sync(item)

    assert response.json()["rejected"] == [
        {"id": item["id"], "code": "unknown_scenario", "retryable": False}
    ]


async def test_unknown_scenario_is_rejected_even_for_a_missing_worker(
    kiosk: Kiosk, catalog: ContentCatalog
) -> None:
    """Permanent problems win over retryable ones, so the device stops retrying."""
    item = attempt_item(catalog, uuid7(), scenarioId="MACHINE_01")

    response = await kiosk.sync(item)

    assert response.json()["rejected"][0]["code"] == "unknown_scenario"


async def test_attempt_id_must_match_the_result(
    kiosk: Kiosk, db: AsyncSession, site: Site, catalog: ContentCatalog
) -> None:
    worker = await add_worker(db, site)
    item = attempt_item(catalog, worker.id, attemptId=str(uuid7()))

    response = await kiosk.sync(item)

    assert response.json()["rejected"][0]["code"] == "invalid_payload"


# --- certificates ---


async def test_valid_certificate_is_stored(
    kiosk: Kiosk,
    db: AsyncSession,
    site: Site,
    root_key: Ed25519PrivateKey,
    device_key: Ed25519PrivateKey,
) -> None:
    worker = await add_worker(db, site)
    cid = uuid7()
    attestation = attestation_for(root_key, kiosk.device.id, device_key)
    token = certificate_token(device_key, attestation, cid=cid, wid=worker.id)

    response = await kiosk.sync(certificate_item(cid, worker.id, token))

    assert response.json() == {"accepted": [str(cid)], "rejected": []}
    cert = await db.get(Certificate, cid)
    assert cert is not None
    assert (cert.worker_id, cert.device_id, cert.token) == (worker.id, kiosk.device.id, token)
    assert (cert.issued_at, cert.expires_at, cert.revoked_at) == (
        NOW - 3600,
        NOW - 3600 + 365 * 86400,
        None,
    )
    again = await kiosk.sync(certificate_item(cid, worker.id, token))
    assert again.json()["accepted"] == [str(cid)]
    assert await count(db, Certificate) == 1


async def test_shared_vector_certificate_is_accepted(
    kiosk: Kiosk, db: AsyncSession, site: Site, vectors: dict[str, Any]
) -> None:
    """docs/04 V1: the vector certificate verifies at NOW with the test root key."""
    worker_id = uuid.UUID("0191f6a0-0000-7000-8000-00000000a001")
    await add_worker(db, site, worker_id=worker_id)
    cid = uuid.UUID("0191f6a0-0000-7000-8000-00000000c001")

    response = await kiosk.sync(certificate_item(cid, worker_id, vectors["cert"]))

    assert response.json()["accepted"] == [str(cid)]


async def test_expired_certificate_is_still_recorded(
    kiosk: Kiosk,
    db: AsyncSession,
    site: Site,
    root_key: Ed25519PrivateKey,
    device_key: Ed25519PrivateKey,
) -> None:
    worker = await add_worker(db, site)
    cid = uuid7()
    attestation = attestation_for(root_key, kiosk.device.id, device_key, iat=NOW - 900 * 86400)
    token = certificate_token(
        device_key,
        attestation,
        cid=cid,
        wid=worker.id,
        iat=NOW - 800 * 86400,
        exp=NOW - 435 * 86400,
    )

    response = await kiosk.sync(certificate_item(cid, worker.id, token))

    assert response.json()["accepted"] == [str(cid)]


async def test_tampered_certificate_is_invalid(
    kiosk: Kiosk, db: AsyncSession, site: Site, vectors: dict[str, Any]
) -> None:
    worker_id = uuid.UUID("0191f6a0-0000-7000-8000-00000000a001")
    await add_worker(db, site, worker_id=worker_id)
    cid = uuid.UUID("0191f6a0-0000-7000-8000-00000000c001")

    response = await kiosk.sync(certificate_item(cid, worker_id, vectors["tampered"]))

    assert response.json()["rejected"] == [
        {"id": str(cid), "code": "invalid_certificate", "retryable": False}
    ]
    assert await count(db, Certificate) == 0


async def test_certificate_signed_by_an_unattested_key_is_invalid(
    kiosk: Kiosk,
    db: AsyncSession,
    site: Site,
    device_key: Ed25519PrivateKey,
) -> None:
    worker = await add_worker(db, site)
    cid = uuid7()
    rogue_root = Ed25519PrivateKey.generate()
    attestation = attestation_for(rogue_root, kiosk.device.id, device_key)
    token = certificate_token(device_key, attestation, cid=cid, wid=worker.id)

    response = await kiosk.sync(certificate_item(cid, worker.id, token))

    assert response.json()["rejected"][0]["code"] == "invalid_certificate"


async def test_certificate_for_a_missing_worker_is_retryable(
    kiosk: Kiosk, root_key: Ed25519PrivateKey, device_key: Ed25519PrivateKey
) -> None:
    worker_id, cid = uuid7(), uuid7()
    attestation = attestation_for(root_key, kiosk.device.id, device_key)
    token = certificate_token(device_key, attestation, cid=cid, wid=worker_id)

    response = await kiosk.sync(certificate_item(cid, worker_id, token))

    assert response.json()["rejected"] == [
        {"id": str(cid), "code": "missing_worker", "retryable": True}
    ]


@pytest.mark.parametrize("mismatch", ["cid", "wid", "site"])
async def test_certificate_must_match_its_item_worker_and_site(
    kiosk: Kiosk,
    db: AsyncSession,
    site: Site,
    root_key: Ed25519PrivateKey,
    device_key: Ed25519PrivateKey,
    mismatch: str,
) -> None:
    worker = await add_worker(db, site)
    cid = uuid7()
    site_code = "JSR-02" if mismatch == "site" else "DHN-01"
    attestation = attestation_for(root_key, kiosk.device.id, device_key, site=site_code)
    token = certificate_token(
        device_key,
        attestation,
        cid=uuid7() if mismatch == "cid" else cid,
        wid=uuid7() if mismatch == "wid" else worker.id,
        site=site_code,
    )

    response = await kiosk.sync(certificate_item(cid, worker.id, token))

    assert response.json()["rejected"][0]["code"] == "invalid_certificate"


async def test_same_certificate_id_with_another_token_is_conflict_immutable(
    kiosk: Kiosk,
    db: AsyncSession,
    site: Site,
    root_key: Ed25519PrivateKey,
    device_key: Ed25519PrivateKey,
) -> None:
    worker = await add_worker(db, site)
    cid = uuid7()
    attestation = attestation_for(root_key, kiosk.device.id, device_key)
    first = certificate_token(device_key, attestation, cid=cid, wid=worker.id)
    second = certificate_token(device_key, attestation, cid=cid, wid=worker.id, name="Ravi M.")
    await kiosk.sync(certificate_item(cid, worker.id, first))

    response = await kiosk.sync(certificate_item(cid, worker.id, second))

    assert response.json()["rejected"][0]["code"] == "conflict_immutable"


# --- envelope and auth ---


async def test_more_than_50_items_is_422(kiosk: Kiosk) -> None:
    response = await kiosk.sync(*[worker_item(uuid7()) for _ in range(51)])

    assert response.status_code == 422
    assert response.json()["error"]["message"].startswith("body.items:")


async def test_unknown_kind_is_422(kiosk: Kiosk) -> None:
    response = await kiosk.sync({"kind": "selfie", "id": str(uuid7()), "payload": {}})

    assert response.status_code == 422


async def test_body_over_2_mb_is_413(kiosk: Kiosk) -> None:
    padding = "x" * (2 * 1024 * 1024)

    response = await kiosk.sync(worker_item(uuid7(), displayName=padding))

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


async def test_pending_device_cannot_sync(
    client: AsyncClient, db: AsyncSession, site: Site
) -> None:
    key = Ed25519PrivateKey.generate()
    pending = Kiosk(client, await add_device(db, site, key, status="pending"), key)

    response = await pending.sync(worker_item(uuid7()))

    assert response.status_code == 403
