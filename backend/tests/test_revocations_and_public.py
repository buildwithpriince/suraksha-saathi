"""T-54: revocation (SR1 on revoke), GET /v1/revocations, content manifest, public verify."""

import uuid
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_now
from app.config import Settings
from app.crypto.bodies import RevocationListBody
from app.crypto.tokens import Prefix, verify_token
from app.db.models import Certificate, RevocationList, Worker
from tests.factories import NOW, add_admin, add_device, add_site, add_worker, admin_token, bearer

pytestmark = pytest.mark.anyio

VECTOR_CID = uuid.UUID("0191f6a0-0000-7000-8000-00000000c001")
VECTOR_WID = uuid.UUID("0191f6a0-0000-7000-8000-00000000a001")


async def _vector_certificate(db: AsyncSession, vectors: dict[str, Any]) -> Certificate:
    """The docs/04 vector certificate as if a DHN-01 kiosk had synced it."""
    site = await add_site(db)
    device = await add_device(db, site)
    await add_worker(db, site, worker_id=VECTOR_WID)
    cert = Certificate(
        id=VECTOR_CID,
        worker_id=VECTOR_WID,
        device_id=device.id,
        token=vectors["cert"],
        issued_at=1789000000,
        expires_at=1820536000,
        received_at=NOW,
    )
    db.add(cert)
    await db.commit()
    return cert


def _revocation_body(token: str, root_key: Ed25519PrivateKey) -> RevocationListBody:
    return verify_token(token, Prefix.REVOCATION_LIST, root_key.public_key(), RevocationListBody)


async def _list_count(db: AsyncSession) -> int:
    return (await db.scalar(select(func.count()).select_from(RevocationList))) or 0


@pytest.fixture
async def admin_headers(db: AsyncSession, jwt_key: ec.EllipticCurvePrivateKey) -> dict[str, str]:
    return bearer(admin_token(jwt_key, await add_admin(db)))


# --- GET /v1/revocations ---


async def test_first_fetch_serves_a_signed_empty_list_once(
    client: AsyncClient, db: AsyncSession, root_key: Ed25519PrivateKey
) -> None:
    first = await client.get("/v1/revocations")
    second = await client.get("/v1/revocations")

    assert first.status_code == 200
    assert first.json()["iat"] == NOW
    assert _revocation_body(first.json()["token"], root_key) == RevocationListBody(iat=NOW, cids=[])
    assert second.json() == first.json()
    assert await _list_count(db) == 1


async def test_revocations_are_public(client: AsyncClient) -> None:
    response = await client.get("/v1/revocations")  # no device headers, no JWT

    assert response.status_code == 200


# --- POST /v1/admin/certificates/{id}/revoke ---


async def test_revoke_marks_the_certificate_and_re_signs_sr1(
    client: AsyncClient,
    db: AsyncSession,
    vectors: dict[str, Any],
    root_key: Ed25519PrivateKey,
    admin_headers: dict[str, str],
) -> None:
    await _vector_certificate(db, vectors)

    response = await client.post(
        f"/v1/admin/certificates/{VECTOR_CID}/revoke",
        json={"reason": "Issued to the wrong worker"},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": str(VECTOR_CID),
        "worker": {"id": str(VECTOR_WID), "displayName": "Ravi Munda", "site": "DHN-01"},
        "issuedAt": 1789000000,
        "expiresAt": 1820536000,
        "status": "revoked",
        "revokedAt": NOW,
        "revokedReason": "Issued to the wrong worker",
    }
    published = (await client.get("/v1/revocations")).json()
    assert _revocation_body(published["token"], root_key) == RevocationListBody(
        iat=NOW, cids=[str(VECTOR_CID)]
    )


async def test_revoking_twice_changes_nothing(
    client: AsyncClient, db: AsyncSession, vectors: dict[str, Any], admin_headers: dict[str, str]
) -> None:
    await _vector_certificate(db, vectors)
    path = f"/v1/admin/certificates/{VECTOR_CID}/revoke"
    await client.post(path, json={"reason": "first"}, headers=admin_headers)

    again = await client.post(path, json={"reason": "second"}, headers=admin_headers)

    assert again.status_code == 200
    assert again.json()["revokedReason"] == "first"
    assert await _list_count(db) == 1


async def test_later_revocations_accumulate_in_the_list(
    app: FastAPI,
    client: AsyncClient,
    db: AsyncSession,
    vectors: dict[str, Any],
    root_key: Ed25519PrivateKey,
    admin_headers: dict[str, str],
) -> None:
    cert = await _vector_certificate(db, vectors)
    other = Certificate(
        id=uuid.UUID("0191f6a0-0000-7000-8000-00000000c002"),
        worker_id=cert.worker_id,
        device_id=cert.device_id,
        token="SS1.not.checked",
        issued_at=1789000000,
        expires_at=1820536000,
        received_at=NOW,
    )
    db.add(other)
    await db.commit()
    await client.post(
        f"/v1/admin/certificates/{other.id}/revoke", json={"reason": "a"}, headers=admin_headers
    )
    app.dependency_overrides[get_now] = lambda: NOW + 60

    await client.post(
        f"/v1/admin/certificates/{VECTOR_CID}/revoke", json={"reason": "b"}, headers=admin_headers
    )

    published = (await client.get("/v1/revocations")).json()
    assert published["iat"] == NOW + 60
    assert _revocation_body(published["token"], root_key).cids == sorted(
        [str(VECTOR_CID), str(other.id)]
    )


async def test_revoke_requires_a_reason(
    client: AsyncClient, db: AsyncSession, vectors: dict[str, Any], admin_headers: dict[str, str]
) -> None:
    await _vector_certificate(db, vectors)

    response = await client.post(
        f"/v1/admin/certificates/{VECTOR_CID}/revoke", json={"reason": ""}, headers=admin_headers
    )

    assert response.status_code == 422


async def test_unknown_certificate_is_404(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    response = await client.post(
        f"/v1/admin/certificates/{uuid.uuid4()}/revoke", json={"reason": "x"}, headers=admin_headers
    )

    assert response.status_code == 404


async def test_supervisor_can_revoke_only_at_their_sites(
    client: AsyncClient,
    db: AsyncSession,
    vectors: dict[str, Any],
    jwt_key: ec.EllipticCurvePrivateKey,
) -> None:
    await _vector_certificate(db, vectors)
    other_site = await add_site(db, code="JSR-02", sector="steel")
    outsider = bearer(admin_token(jwt_key, await add_admin(db, "supervisor", [other_site.id])))
    path = f"/v1/admin/certificates/{VECTOR_CID}/revoke"

    denied = await client.post(path, json={"reason": "x"}, headers=outsider)

    assert denied.status_code == 404  # out-of-scope rows look like missing rows
    stored = await db.get(Certificate, VECTOR_CID)
    await db.refresh(stored)
    assert stored is not None
    assert stored.revoked_at is None


async def test_supervisor_revokes_at_own_site(
    client: AsyncClient,
    db: AsyncSession,
    vectors: dict[str, Any],
    jwt_key: ec.EllipticCurvePrivateKey,
) -> None:
    await _vector_certificate(db, vectors)
    worker = await db.get(Worker, VECTOR_WID)
    assert worker is not None
    supervisor = bearer(admin_token(jwt_key, await add_admin(db, "supervisor", [worker.site_id])))

    response = await client.post(
        f"/v1/admin/certificates/{VECTOR_CID}/revoke", json={"reason": "x"}, headers=supervisor
    )

    assert response.status_code == 200


# --- GET /v1/content/manifest ---


async def test_manifest_lists_content_version_and_scenarios(client: AsyncClient) -> None:
    response = await client.get("/v1/content/manifest")

    assert response.status_code == 200
    assert response.json() == {
        "contentVersion": "2026.09.2",
        "scenarios": [{"id": "FIRE_01", "version": 1}, {"id": "GAS_01", "version": 1}],
    }


# --- GET /v1/public/verify ---


async def test_verify_valid_certificate(client: AsyncClient, vectors: dict[str, Any]) -> None:
    response = await client.get("/v1/public/verify", params={"token": vectors["cert"]})

    assert response.status_code == 200
    assert response.json() == {
        "status": "VALID",
        "workerName": "Ravi Munda",
        "site": "DHN-01",
        "modules": [{"id": "FIRE_01", "score": 86}, {"id": "GAS_01", "score": 91}],
        "issuedAt": 1789000000,
        "expiresAt": 1820536000,
        "checkedAt": NOW,
    }


async def test_verify_expired_certificate_keeps_worker_fields(
    app: FastAPI, client: AsyncClient, vectors: dict[str, Any]
) -> None:
    app.dependency_overrides[get_now] = lambda: 1830000000  # docs/04 V2

    body = (await client.get("/v1/public/verify", params={"token": vectors["cert"]})).json()

    assert body["status"] == "EXPIRED"
    assert body["workerName"] == "Ravi Munda"


async def test_verify_tampered_certificate_omits_worker_fields(
    client: AsyncClient, vectors: dict[str, Any]
) -> None:
    response = await client.get("/v1/public/verify", params={"token": vectors["tampered"]})

    assert response.json() == {"status": "INVALID_SIGNATURE", "checkedAt": NOW}


async def test_verify_garbage_is_invalid_format(client: AsyncClient) -> None:
    response = await client.get("/v1/public/verify", params={"token": "hello"})

    assert response.json() == {"status": "INVALID_FORMAT", "checkedAt": NOW}


async def test_verify_sees_a_revocation_immediately(
    client: AsyncClient, db: AsyncSession, vectors: dict[str, Any], admin_headers: dict[str, str]
) -> None:
    await _vector_certificate(db, vectors)
    await client.post(
        f"/v1/admin/certificates/{VECTOR_CID}/revoke", json={"reason": "x"}, headers=admin_headers
    )

    body = (await client.get("/v1/public/verify", params={"token": vectors["cert"]})).json()

    assert body["status"] == "REVOKED"
    assert body["workerName"] == "Ravi Munda"


async def test_verify_without_a_token_is_422(client: AsyncClient) -> None:
    response = await client.get("/v1/public/verify")

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "query.token: Field required"


async def test_verify_is_503_without_a_root_key(
    app: FastAPI, client: AsyncClient, settings: Settings, vectors: dict[str, Any]
) -> None:
    app.state.settings = settings.model_copy(update={"root_signing_key_b64": None})

    response = await client.get("/v1/public/verify", params={"token": vectors["cert"]})

    assert response.status_code == 503
