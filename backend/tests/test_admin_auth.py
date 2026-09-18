"""T-51: admin auth = Supabase JWT (JWKS keys) + admin_profiles role (docs/06, D-020)."""

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.services.admin_auth import supabase_verifier
from tests.factories import add_admin, add_device, add_site, admin_token, bearer

pytestmark = pytest.mark.anyio

APPROVE = "/v1/admin/devices/{}/approve"


async def _pending_device_path(db: AsyncSession) -> str:
    device = await add_device(db, await add_site(db), status="pending")
    return APPROVE.format(device.id)


async def test_missing_token_is_401(client: AsyncClient, db: AsyncSession) -> None:
    response = await client.post(await _pending_device_path(db))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_non_bearer_scheme_is_401(client: AsyncClient, db: AsyncSession) -> None:
    response = await client.post(
        await _pending_device_path(db), headers={"Authorization": "Basic abc"}
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": int(time.time()) - 10},  # expired
        {"aud": "anon"},  # wrong audience
        {"iss": "https://evil.supabase.co/auth/v1"},  # another project
        {"sub": "not-a-uuid"},
    ],
    ids=["expired", "audience", "issuer", "sub"],
)
async def test_invalid_claims_are_401(
    client: AsyncClient, db: AsyncSession, jwt_key: ec.EllipticCurvePrivateKey, overrides: dict
) -> None:
    user_id = await add_admin(db)
    token = admin_token(jwt_key, user_id, **overrides)

    response = await client.post(await _pending_device_path(db), headers=bearer(token))

    assert response.status_code == 401


async def test_token_signed_by_another_key_is_401(client: AsyncClient, db: AsyncSession) -> None:
    user_id = await add_admin(db)
    token = admin_token(ec.generate_private_key(ec.SECP256R1()), user_id)

    response = await client.post(await _pending_device_path(db), headers=bearer(token))

    assert response.status_code == 401


async def test_hs256_token_is_rejected(client: AsyncClient, db: AsyncSession) -> None:
    """Algorithm confusion: an HMAC token must never be accepted (JWKS keys only)."""
    user_id = await add_admin(db)
    token = jwt.encode(
        {"sub": str(user_id), "aud": "authenticated", "exp": int(time.time()) + 60},
        "shared-secret-shared-secret-shared",
        algorithm="HS256",
    )

    response = await client.post(await _pending_device_path(db), headers=bearer(token))

    assert response.status_code == 401


async def test_valid_token_without_a_profile_is_403(
    client: AsyncClient, db: AsyncSession, jwt_key: ec.EllipticCurvePrivateKey
) -> None:
    token = admin_token(jwt_key, uuid.uuid4())

    response = await client.post(await _pending_device_path(db), headers=bearer(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


async def test_supervisor_cannot_approve_devices(
    client: AsyncClient, db: AsyncSession, jwt_key: ec.EllipticCurvePrivateKey
) -> None:
    path = await _pending_device_path(db)
    user_id = await add_admin(db, role="supervisor")

    response = await client.post(path, headers=bearer(admin_token(jwt_key, user_id)))

    assert response.status_code == 403


async def test_admin_routes_are_503_when_supabase_is_not_configured(
    app: FastAPI, client: AsyncClient, db: AsyncSession
) -> None:
    app.state.jwt_verifier = None

    response = await client.post(await _pending_device_path(db), headers=bearer("x.y.z"))

    assert response.status_code == 503


def test_verifier_is_built_only_when_jwks_url_is_set() -> None:
    assert supabase_verifier(Settings(_env_file=None)) is None
    assert (
        supabase_verifier(
            Settings(
                _env_file=None,
                supabase_url="https://abc.supabase.co",
                supabase_jwks_url="https://abc.supabase.co/auth/v1/.well-known/jwks.json",
            )
        )
        is not None
    )
