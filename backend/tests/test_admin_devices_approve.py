"""T-51: POST /v1/admin/devices/{id}/approve signs a 365-day SA1 attestation (docs/04, docs/06)."""

import uuid

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_now
from app.config import Settings
from app.crypto.bodies import AttestationBody
from app.crypto.keys import public_key_b64url
from app.crypto.tokens import Prefix, verify_token
from app.db.models import Device
from app.services.attestation import ATTESTATION_VALIDITY_SECONDS
from tests.factories import NOW, add_admin, add_device, add_site, admin_token, bearer

pytestmark = pytest.mark.anyio


@pytest.fixture
async def admin_headers(db: AsyncSession, jwt_key: ec.EllipticCurvePrivateKey) -> dict[str, str]:
    return bearer(admin_token(jwt_key, await add_admin(db)))


async def test_approve_signs_a_root_attestation_for_the_device(
    client: AsyncClient,
    db: AsyncSession,
    admin_headers: dict[str, str],
    root_key: Ed25519PrivateKey,
) -> None:
    device_key = Ed25519PrivateKey.generate()
    device = await add_device(db, await add_site(db), device_key, status="pending")

    response = await client.post(f"/v1/admin/devices/{device.id}/approve", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {
        "id": str(device.id),
        "label": "Kiosk tablet 1",
        "site": "DHN-01",
        "status": "approved",
        "lastSeenAt": None,
        "approvedAt": NOW,
    }
    await db.refresh(device)
    assert device.attestation_token is not None
    body = verify_token(
        device.attestation_token, Prefix.ATTESTATION, root_key.public_key(), AttestationBody
    )
    assert body == AttestationBody(
        did=str(device.id),
        dpk=public_key_b64url(device_key.public_key()),
        site="DHN-01",
        iat=NOW,
        exp=NOW + ATTESTATION_VALIDITY_SECONDS,
    )
    assert device.attestation_expires_at == body.exp
    assert device.approved_at == NOW


async def test_approving_again_renews_the_attestation(
    app: FastAPI, client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str]
) -> None:
    device = await add_device(db, await add_site(db), status="pending")
    await client.post(f"/v1/admin/devices/{device.id}/approve", headers=admin_headers)
    app.dependency_overrides[get_now] = lambda: NOW + 100

    await client.post(f"/v1/admin/devices/{device.id}/approve", headers=admin_headers)

    await db.refresh(device)
    assert device.attestation_expires_at == NOW + 100 + ATTESTATION_VALIDITY_SECONDS


async def test_unknown_device_is_404(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    response = await client.post(f"/v1/admin/devices/{uuid.uuid4()}/approve", headers=admin_headers)

    assert response.status_code == 404


async def test_revoked_device_cannot_be_approved(
    client: AsyncClient, db: AsyncSession, admin_headers: dict[str, str]
) -> None:
    device = await add_device(db, await add_site(db), status="revoked")

    response = await client.post(f"/v1/admin/devices/{device.id}/approve", headers=admin_headers)

    assert response.status_code == 409
    stored = await db.get(Device, device.id)
    assert stored is not None
    assert stored.attestation_token is None


async def test_approve_is_503_without_a_root_key(
    app: FastAPI,
    client: AsyncClient,
    db: AsyncSession,
    settings: Settings,
    admin_headers: dict[str, str],
) -> None:
    app.state.settings = settings.model_copy(update={"root_signing_key_b64": None})
    device = await add_device(db, await add_site(db), status="pending")

    response = await client.post(f"/v1/admin/devices/{device.id}/approve", headers=admin_headers)

    assert response.status_code == 503
    assert "not configured" in response.json()["error"]["message"]
