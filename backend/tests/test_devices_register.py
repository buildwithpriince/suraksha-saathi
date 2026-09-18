"""T-51: POST /v1/devices/register (docs/06)."""

import uuid
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.rate_limit import RateLimiter
from app.crypto import base64url
from app.crypto.keys import public_key_b64url
from app.db.models import Device
from tests.factories import NOW, add_site

pytestmark = pytest.mark.anyio

DEVICE_ID = "0191f6a0-0000-7000-8000-000000000001"


def _body(key: Ed25519PrivateKey | None = None, **overrides: Any) -> dict[str, Any]:
    key = key or Ed25519PrivateKey.generate()
    body = {
        "deviceId": DEVICE_ID,
        "siteCode": "DHN-01",
        "label": "Kiosk tablet 1",
        "publicKey": public_key_b64url(key.public_key()),
    }
    body.update(overrides)
    return body


async def test_new_device_is_stored_pending(client: AsyncClient, db: AsyncSession) -> None:
    site = await add_site(db)
    body = _body()

    response = await client.post("/v1/devices/register", json=body)

    assert response.status_code == 201
    assert response.json() == {"status": "pending"}
    device = await db.get(Device, uuid.UUID(DEVICE_ID))
    assert device is not None
    assert (device.site_id, device.label, device.public_key, device.status) == (
        site.id,
        "Kiosk tablet 1",
        body["publicKey"],
        "pending",
    )
    assert device.created_at == NOW
    assert device.attestation_token is None


async def test_same_id_and_key_again_is_a_no_op(client: AsyncClient, db: AsyncSession) -> None:
    await add_site(db)
    body = _body()
    await client.post("/v1/devices/register", json=body)

    response = await client.post("/v1/devices/register", json=body)

    assert response.status_code == 201
    assert response.json() == {"status": "pending"}


async def test_re_registering_reports_the_current_status(
    client: AsyncClient, db: AsyncSession
) -> None:
    await add_site(db)
    body = _body()
    await client.post("/v1/devices/register", json=body)
    device = await db.get(Device, uuid.UUID(DEVICE_ID))
    assert device is not None
    device.status = "approved"
    await db.commit()

    response = await client.post("/v1/devices/register", json=body)

    assert response.json() == {"status": "approved"}


async def test_same_id_with_a_different_key_is_409(client: AsyncClient, db: AsyncSession) -> None:
    await add_site(db)
    await client.post("/v1/devices/register", json=_body())

    response = await client.post("/v1/devices/register", json=_body())  # new random key

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


async def test_unknown_site_is_a_validation_error(client: AsyncClient, db: AsyncSession) -> None:
    await add_site(db)

    response = await client.post("/v1/devices/register", json=_body(siteCode="XXX-99"))

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "validation_error",
        "message": "body.siteCode: Unknown site code",
    }


@pytest.mark.parametrize(
    "public_key",
    [
        base64url.encode(bytes(32)),  # all-zero key buffer: a small-order point (D-015)
        base64url.encode(bytes([1]) + bytes(31)),  # the identity point
        "AAAA",  # too short
        "5_FioQvsVZr-oZXk3OhLaVaNXSywlj60RsBoXisX8vA=",  # padded: not canonical (D-013)
        "not base64url!",
    ],
)
async def test_bad_public_keys_are_rejected(
    client: AsyncClient, db: AsyncSession, public_key: str
) -> None:
    await add_site(db)

    response = await client.post("/v1/devices/register", json=_body(publicKey=public_key))

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["message"].startswith("body.publicKey:")
    assert public_key not in error["message"]  # never echo submitted values (docs/06)


@pytest.mark.parametrize("field", ["deviceId", "siteCode", "label", "publicKey"])
async def test_missing_fields_are_named(client: AsyncClient, field: str) -> None:
    body = _body()
    del body[field]

    response = await client.post("/v1/devices/register", json=body)

    assert response.status_code == 422
    assert f"body.{field}: Field required" in response.json()["error"]["message"]


async def test_register_is_rate_limited_per_ip(
    app: FastAPI, client: AsyncClient, db: AsyncSession
) -> None:
    await add_site(db)
    app.state.register_limiter = RateLimiter(limit=2, window_seconds=60)
    body = _body()

    statuses = [
        (await client.post("/v1/devices/register", json=body)).status_code for _ in range(3)
    ]

    assert statuses == [201, 201, 429]


def test_rate_limiter_window_slides() -> None:
    limiter = RateLimiter(limit=1, window_seconds=60)
    limiter.check("1.2.3.4", now=0)
    limiter.check("5.6.7.8", now=1)  # other clients are independent

    limiter.check("1.2.3.4", now=60.5)  # the first hit has left the window
