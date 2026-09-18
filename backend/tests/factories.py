"""Row builders and request helpers shared by the API tests."""

import hashlib
import time
import uuid
from fractions import Fraction
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import base64url
from app.crypto.bodies import AttestationBody, CertificateBody, ModuleScore
from app.crypto.keys import public_key_b64url
from app.crypto.tokens import Prefix, sign_token
from app.db.ids import uuid7
from app.db.models import AdminProfile, Device, Site, Worker
from app.services.content import Scenario

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


def attempt_result(
    scenario: Scenario,
    attempt_id: uuid.UUID,
    variant: str,
    *,
    earned: dict[str, float] | None = None,
    **overrides: Any,
) -> dict[str, Any]:
    """A docs/03 AttemptResult the way an honest engine reports it. `earned` lowers rule points."""
    earned = earned or {}
    rules, critical_failures = [], []
    earned_total = max_total = 0.0
    for rule in scenario.rules_for(variant).values():
        points = earned.get(rule.id, float(rule.points))
        passed = points == rule.points
        if rule.critical and not passed and (rule.critical_on is None or points == 0):
            critical_failures.append(rule.id)
        rules.append(
            {
                "ruleId": rule.id,
                "earned": points,
                "max": rule.points,
                "critical": rule.critical,
                "passed": passed,
                "feedbackKey": f"{scenario.id.lower()}.rule.{rule.id.lower()}",
            }
        )
        earned_total += points
        max_total += rule.points
    score = int(Fraction(100 * earned_total / max_total) + Fraction(1, 2))  # half away from zero
    result = {
        "attemptId": str(attempt_id),
        "scenarioId": scenario.id,
        "scenarioVersion": scenario.version,
        "variant": variant,
        "seed": 123456,
        "mode": "ar",
        "startedAt": NOW - 600,
        "durationSec": 212.4,
        "scorePercent": score,
        "passed": not critical_failures and score >= scenario.pass_threshold_percent,
        "criticalFailures": critical_failures,
        "rules": rules,
        "eventsSha256": "0" * 64,
    }
    result.update(overrides)
    return result


def attestation_for(
    root_key: Ed25519PrivateKey,
    device_id: uuid.UUID,
    device_key: Ed25519PrivateKey,
    site: str = "DHN-01",
    iat: int = NOW - 86400 * 30,
    exp: int = NOW + 86400 * 335,
) -> str:
    body = AttestationBody(
        did=str(device_id),
        dpk=public_key_b64url(device_key.public_key()),
        site=site,
        iat=iat,
        exp=exp,
    )
    return sign_token(Prefix.ATTESTATION, body, root_key)


def certificate_token(
    device_key: Ed25519PrivateKey,
    attestation: str,
    *,
    cid: uuid.UUID,
    wid: uuid.UUID,
    site: str = "DHN-01",
    name: str = "Ravi Munda",
    iat: int = NOW - 3600,
    exp: int = NOW - 3600 + 365 * 86400,
) -> str:
    body = CertificateBody(
        cid=str(cid),
        wid=str(wid),
        wn=name,
        site=site,
        mods=[ModuleScore(id="FIRE_01", v=1, s=86), ModuleScore(id="GAS_01", v=1, s=91)],
        iat=iat,
        exp=exp,
        lang="hi",
        att=attestation,
    )
    return sign_token(Prefix.CERTIFICATE, body, device_key)


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
