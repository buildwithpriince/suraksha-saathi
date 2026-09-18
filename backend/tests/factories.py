"""Row builders and request helpers shared by the API tests."""

import hashlib
import time
import uuid
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import base64url
from app.crypto.keys import public_key_b64url
from app.db.ids import uuid7
from app.db.models import AdminProfile, Device, Site, Worker

NOW = 1789100000  # pinned server clock for API tests (docs/04 V1 "now")
JWT_ISSUER = "https://test.supabase.co/auth/v1"


async def add_site(
    db: AsyncSession, code: str = "DHN-01", sector: str = "coal", name: str | None = None
) -> Site:
    site = Site(
        id=uuid7(), code=code, name=name or f"Site {code}", district="Dhanbad", sector=sector
    )
    db.add(site)
    await db.commit()
    return site


async def add_device(
    db: AsyncSession,
    site: Site,
    key: Ed25519PrivateKey | None = None,
    *,
    status: str = "approved",
    device_id: uuid.UUID | None = None,
    attestation: str | None = None,
) -> Device:
    key = key or Ed25519PrivateKey.generate()
    device = Device(
        id=device_id or uuid7(),
        site_id=site.id,
        label="Kiosk tablet 1",
        public_key=public_key_b64url(key.public_key()),
        status=status,
        attestation_token=attestation,
        created_at=NOW - 1000,
    )
    db.add(device)
    await db.commit()
    return device


async def add_worker(
    db: AsyncSession, site: Site, *, name: str = "Ravi Munda", worker_id: uuid.UUID | None = None
) -> Worker:
    worker = Worker(
        id=worker_id or uuid7(),
        site_id=site.id,
        display_name=name,
        preferred_lang="hi",
        created_at=NOW - 500,
        updated_at=NOW - 500,
    )
    db.add(worker)
    await db.commit()
    return worker


async def add_admin(
    db: AsyncSession, role: str = "admin", site_ids: list[uuid.UUID] | None = None
) -> uuid.UUID:
    user_id = uuid.uuid4()
    db.add(AdminProfile(user_id=user_id, role=role, site_ids=site_ids or []))
    await db.commit()
    return user_id


def admin_token(jwt_key: ec.EllipticCurvePrivateKey, user_id: uuid.UUID, **overrides: Any) -> str:
    """A Supabase-style access token signed with the test JWT key."""
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "aud": "authenticated",
        "iss": JWT_ISSUER,
        "exp": int(time.time()) + 3600,  # PyJWT checks exp against the real clock
        "role": "authenticated",
    }
    claims.update(overrides)
    return jwt.encode(claims, jwt_key, algorithm="ES256")


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def signed_headers(
    key: Ed25519PrivateKey,
    device_id: uuid.UUID,
    method: str,
    path: str,
    body: bytes = b"",
    timestamp: int = NOW,
) -> dict[str, str]:
    """docs/05 device auth headers: signature over METHOD\\nPATH\\nTIMESTAMP\\nhex(sha256(body))."""
    message = f"{method}\n{path}\n{timestamp}\n{hashlib.sha256(body).hexdigest()}"
    return {
        "X-Device-Id": str(device_id),
        "X-Timestamp": str(timestamp),
        "X-Signature": base64url.encode(key.sign(message.encode("ascii"))),
    }
