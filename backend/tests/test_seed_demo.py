"""T-56: seed_demo produces the docs/08 demo dataset with really-signed tokens."""

import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.crypto.bodies import CertificateBody
from app.crypto.tokens import Prefix, parse_body, split_token
from app.db.engine import create_engine, create_sessionmaker
from app.db.models import Attempt, Base, Certificate, Worker
from app.tools import seed_demo
from tests.factories import NOW, admin_token, bearer

pytestmark = pytest.mark.anyio

ADMIN_ID = uuid.UUID("6f1c2a8e-8a4b-4d0e-9b1a-2f3c4d5e6f70")


@pytest.fixture
async def seeded(
    app: FastAPI, db: AsyncSession, settings: Settings, root_key: Ed25519PrivateKey
) -> seed_demo.SeedSummary:
    return await seed_demo.seed(
        db,
        catalog=app.state.catalog,
        content_dir=settings.content_dir,
        root_key=root_key,
        now=NOW,
        admins=[ADMIN_ID],
    )


@pytest.fixture
def admin(jwt_key: ec.EllipticCurvePrivateKey) -> dict[str, str]:
    return bearer(admin_token(jwt_key, ADMIN_ID))


async def test_summary_matches_docs08(seeded: seed_demo.SeedSummary) -> None:
    assert (seeded.sites, seeded.workers) == (3, 40)
    assert 130 <= seeded.attempts <= 170  # "~150 attempts"
    assert (seeded.expiring_30d, seeded.revoked, seeded.pending_devices) == (12, 1, 1)
    assert seeded.certificates == 22
    assert seeded.flagged == 2


async def test_dashboard_numbers(
    client: AsyncClient, seeded: seed_demo.SeedSummary, admin: dict[str, str]
) -> None:
    overview = (await client.get("/v1/admin/overview", headers=admin)).json()
    sites = (await client.get("/v1/admin/sites", headers=admin)).json()
    pending = (await client.get("/v1/admin/devices?status=pending", headers=admin)).json()
    revoked = (await client.get("/v1/admin/certificates?status=revoked", headers=admin)).json()

    assert overview["workers"] == 40
    assert overview["recertDue30d"] == 12
    assert overview["attempts7d"] > 0
    assert overview["topFailedRules"][0]["ruleId"] == "R_BUDDY_CHECK"  # docs/08: most failed
    assert overview["topFailedRules"][0]["scenarioId"] == "GAS_01"
    assert [(s["code"], s["sector"]) for s in sites] == [
        ("DHN-01", "coal"),
        ("JSR-02", "steel"),
        ("KDM-03", "mica"),
    ]
    assert len(pending) == 1
    assert revoked["total"] == 1


async def test_every_certificate_verifies_publicly(
    client: AsyncClient, db: AsyncSession, seeded: seed_demo.SeedSummary
) -> None:
    certs = list(await db.scalars(select(Certificate)))

    statuses = {}
    for cert in certs:
        body = (await client.get("/v1/public/verify", params={"token": cert.token})).json()
        statuses[cert.id] = body["status"]
        expected = "REVOKED" if cert.revoked_at else "VALID"
        assert body["status"] == expected, cert.id

    assert sorted(statuses.values()).count("REVOKED") == 1


async def test_certificates_follow_docs04_issuance(
    db: AsyncSession, seeded: seed_demo.SeedSummary
) -> None:
    for cert in await db.scalars(select(Certificate)):
        _, raw, _ = split_token(cert.token, Prefix.CERTIFICATE)
        body = parse_body(raw, CertificateBody)
        assert len(body.wn) <= 24
        assert body.exp == body.iat + 365 * 86400
        assert [m.id for m in body.mods] == ["FIRE_01", "GAS_01"]
        # each module score is a passing attempt of that worker
        for module in body.mods:
            passing = await db.scalar(
                select(func.count())
                .select_from(Attempt)
                .where(
                    Attempt.worker_id == cert.worker_id,
                    Attempt.scenario_id == module.id,
                    Attempt.passed.is_(True),
                    Attempt.score_percent == module.s,
                )
            )
            assert passing, (cert.id, module.id)


async def test_only_the_two_tampered_attempts_are_flagged(
    db: AsyncSession, seeded: seed_demo.SeedSummary
) -> None:
    flagged = list(await db.scalars(select(Attempt).where(Attempt.flagged.is_(True))))

    assert len(flagged) == 2
    for attempt in flagged:
        assert attempt.passed is False
        assert attempt.result_json["passed"] is True
        assert "server computed false" in (attempt.flag_reason or "")


async def test_seeding_twice_changes_nothing(
    app: FastAPI,
    db: AsyncSession,
    settings: Settings,
    root_key: Ed25519PrivateKey,
    seeded: seed_demo.SeedSummary,
) -> None:
    again = await seed_demo.seed(
        db,
        catalog=app.state.catalog,
        content_dir=settings.content_dir,
        root_key=root_key,
        now=NOW,
    )

    assert again.notes == ["Demo sites already exist; nothing was changed."]
    assert await db.scalar(select(func.count()).select_from(Worker)) == 40


async def test_names_are_deterministic(
    app: FastAPI,
    db: AsyncSession,
    settings: Settings,
    root_key: Ed25519PrivateKey,
    seeded: seed_demo.SeedSummary,
    tmp_path: Path,
) -> None:
    other_url = f"sqlite:///{(tmp_path / 'other.db').as_posix()}"
    sync_engine = sa.create_engine(other_url)
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()
    engine = create_engine(other_url)
    async with create_sessionmaker(engine)() as other:
        await seed_demo.seed(
            other,
            catalog=app.state.catalog,
            content_dir=settings.content_dir,
            root_key=root_key,
            now=NOW,
        )
        other_names = set(await other.scalars(select(Worker.display_name)))
    await engine.dispose()

    assert set(await db.scalars(select(Worker.display_name))) == other_names


def test_cli_refuses_without_a_root_key(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'cli.db').as_posix()}")
    monkeypatch.chdir(tmp_path)  # no backend/.env here
    get_settings.cache_clear()
    try:
        assert seed_demo.main([]) == 1
    finally:
        get_settings.cache_clear()
    assert "ROOT_SIGNING_KEY_B64" in capsys.readouterr().err
