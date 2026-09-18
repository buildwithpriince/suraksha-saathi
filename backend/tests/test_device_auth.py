"""T-52: device signed-request auth (docs/05) and GET /v1/devices/me/attestation (docs/06)."""

import uuid

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI, Request
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import base64url
from app.db.models import Device
from app.services.device_auth import ApprovedDevice
from tests.factories import NOW, add_device, add_site, signed_headers

pytestmark = pytest.mark.anyio

ATTESTATION = "/v1/devices/me/attestation"
ECHO = "/_test/device-echo"


@pytest.fixture
def app(app: FastAPI) -> FastAPI:
    """Adds an approved-only POST route to check the body hash and the status rule."""

    @app.post(ECHO)
    async def echo(device: ApprovedDevice, request: Request) -> dict[str, str]:
        return {"device": str(device.id), "body": (await request.body()).decode()}

    return app


@pytest.fixture
def key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.generate()


async def _device(db: AsyncSession, key: Ed25519PrivateKey, status: str = "approved") -> Device:
    return await add_device(db, await add_site(db), key, status=status, attestation="SA1.x.y")


# --- happy paths ---


async def test_signed_request_from_an_approved_device_passes(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)
    body = b'{"items":[]}'

    response = await client.post(
        ECHO, content=body, headers=signed_headers(key, device.id, "POST", ECHO, body)
    )

    assert response.status_code == 200
    assert response.json() == {"device": str(device.id), "body": '{"items":[]}'}


async def test_success_updates_last_seen(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)

    await client.get(ATTESTATION, headers=signed_headers(key, device.id, "GET", ATTESTATION))

    await db.refresh(device)
    assert device.last_seen_at == NOW


@pytest.mark.parametrize("skew", [-300, 300])
async def test_timestamp_at_the_skew_limit_passes(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey, skew: int
) -> None:
    device = await _device(db, key)
    headers = signed_headers(key, device.id, "GET", ATTESTATION, timestamp=NOW + skew)

    response = await client.get(ATTESTATION, headers=headers)

    assert response.status_code == 200


async def test_query_string_is_not_part_of_the_signed_path(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)

    response = await client.get(
        ATTESTATION + "?x=1", headers=signed_headers(key, device.id, "GET", ATTESTATION)
    )

    assert response.status_code == 200


# --- the three failures named in T-52 ---


async def test_bad_signature_is_401(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)
    other_key = Ed25519PrivateKey.generate()

    response = await client.get(
        ATTESTATION, headers=signed_headers(other_key, device.id, "GET", ATTESTATION)
    )

    assert response.status_code == 401
    assert response.json()["error"] == {
        "code": "unauthorized",
        "message": "Bad device signature",
    }


@pytest.mark.parametrize("skew", [-301, 301])
async def test_stale_or_future_timestamp_is_401(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey, skew: int
) -> None:
    device = await _device(db, key)
    headers = signed_headers(key, device.id, "GET", ATTESTATION, timestamp=NOW + skew)

    response = await client.get(ATTESTATION, headers=headers)

    assert response.status_code == 401
    assert "clock skew" in response.json()["error"]["message"]


async def test_pending_device_is_403_on_approved_only_routes(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key, status="pending")

    response = await client.post(
        ECHO, content=b"{}", headers=signed_headers(key, device.id, "POST", ECHO, b"{}")
    )

    assert response.status_code == 403
    assert response.json()["error"] == {
        "code": "forbidden",
        "message": "Device is not approved yet",
    }


async def test_revoked_device_is_403_on_approved_only_routes(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key, status="revoked")

    response = await client.post(
        ECHO, content=b"{}", headers=signed_headers(key, device.id, "POST", ECHO, b"{}")
    )

    assert response.status_code == 403
    assert response.json()["error"]["message"] == "Device is revoked"


# --- what the signature binds ---


async def test_tampered_body_is_401(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)
    headers = signed_headers(key, device.id, "POST", ECHO, b'{"items":[]}')

    response = await client.post(ECHO, content=b'{"items":[1]}', headers=headers)

    assert response.status_code == 401


async def test_signature_for_another_path_is_401(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)

    response = await client.get(
        ATTESTATION, headers=signed_headers(key, device.id, "GET", "/v1/revocations")
    )

    assert response.status_code == 401


async def test_signature_for_another_method_is_401(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)

    response = await client.post(
        ECHO, content=b"", headers=signed_headers(key, device.id, "GET", ECHO, b"")
    )

    assert response.status_code == 401


async def test_pending_device_learns_nothing_without_a_valid_signature(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    """The signature is checked before the status, so a forged call can't probe for approval."""
    device = await _device(db, key, status="pending")

    response = await client.post(
        ECHO,
        content=b"{}",
        headers=signed_headers(Ed25519PrivateKey.generate(), device.id, "POST", ECHO, b"{}"),
    )

    assert response.status_code == 401


# --- malformed headers ---


async def test_unknown_device_is_401(client: AsyncClient, key: Ed25519PrivateKey) -> None:
    response = await client.get(
        ATTESTATION, headers=signed_headers(key, uuid.uuid4(), "GET", ATTESTATION)
    )

    assert response.status_code == 401


@pytest.mark.parametrize("missing", ["X-Device-Id", "X-Timestamp", "X-Signature"])
async def test_missing_header_is_401(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey, missing: str
) -> None:
    device = await _device(db, key)
    headers = signed_headers(key, device.id, "GET", ATTESTATION)
    del headers[missing]

    response = await client.get(ATTESTATION, headers=headers)

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("header", "value"),
    [
        ("X-Device-Id", "kiosk-1"),
        ("X-Timestamp", f"+{NOW}"),
        ("X-Timestamp", f"{NOW}.0"),
        ("X-Timestamp", "-1"),
        ("X-Signature", base64url.encode(bytes(63))),  # not 64 bytes
        ("X-Signature", "A" * 85 + "="),  # padded
    ],
)
async def test_malformed_header_is_401(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey, header: str, value: str
) -> None:
    device = await _device(db, key)
    headers = signed_headers(key, device.id, "GET", ATTESTATION)
    headers[header] = value

    response = await client.get(ATTESTATION, headers=headers)

    assert response.status_code == 401


# --- GET /v1/devices/me/attestation ---


async def test_pending_device_sees_pending_without_an_attestation(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key, status="pending")

    response = await client.get(
        ATTESTATION, headers=signed_headers(key, device.id, "GET", ATTESTATION)
    )

    assert response.status_code == 200
    assert response.json() == {"status": "pending", "attestation": None, "expiresAt": None}


async def test_approved_device_gets_its_attestation(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key)
    device.attestation_expires_at = NOW + 1000
    await db.commit()

    response = await client.get(
        ATTESTATION, headers=signed_headers(key, device.id, "GET", ATTESTATION)
    )

    assert response.json() == {
        "status": "approved",
        "attestation": "SA1.x.y",
        "expiresAt": NOW + 1000,
    }


async def test_revoked_device_is_told_it_is_revoked(
    client: AsyncClient, db: AsyncSession, key: Ed25519PrivateKey
) -> None:
    device = await _device(db, key, status="revoked")

    response = await client.get(
        ATTESTATION, headers=signed_headers(key, device.id, "GET", ATTESTATION)
    )

    assert response.status_code == 200
    assert response.json() == {"status": "revoked", "attestation": None, "expiresAt": None}
