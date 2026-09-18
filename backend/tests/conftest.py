import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
import sqlalchemy as sa
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_now
from app.config import Settings
from app.crypto.keys import seed_b64url
from app.db.models import Base
from app.main import create_app
from app.services.admin_auth import JwtVerifier
from tests.factories import JWT_ISSUER, NOW

REPO_ROOT = Path(__file__).resolve().parents[2]

# Env vars from SETUP.md section 6. Cleared so a developer's shell can't change test results.
_SETTINGS_ENV_VARS = (
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_JWKS_URL",
    "ROOT_SIGNING_KEY_B64",
    "CORS_ORIGINS",
)


@pytest.fixture(autouse=True)
def _clean_settings_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in _SETTINGS_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def database_url(tmp_path: Path) -> str:
    """A fresh SQLite file per test: Docker (Postgres) isn't available everywhere (D-019)."""
    return f"sqlite:///{(tmp_path / 'test.db').as_posix()}"


@pytest.fixture
def settings(database_url: str, root_key: Ed25519PrivateKey) -> Settings:
    # _env_file=None: tests never read a local backend/.env. Root key = docs/04 TEST key.
    return Settings(
        _env_file=None,
        database_url=database_url,
        cors_origins=["http://localhost:5173"],
        root_signing_key_b64=seed_b64url(root_key),
    )


@pytest.fixture
def jwt_key() -> ec.EllipticCurvePrivateKey:
    """Stands in for the Supabase project's JWT signing key (ES256)."""
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def app(settings: Settings, jwt_key: ec.EllipticCurvePrivateKey) -> FastAPI:
    # Tables from the models; tests/test_migrations.py checks the migrations build the same schema
    engine = sa.create_engine(settings.database_url)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = create_app(settings)
    app.state.jwt_verifier = JwtVerifier(lambda _token: jwt_key.public_key(), JWT_ISSUER)
    app.dependency_overrides[get_now] = lambda: NOW
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    await app.state.engine.dispose()


@pytest.fixture
async def db(app: FastAPI) -> AsyncIterator[AsyncSession]:
    """A session on the app's database, for arranging and checking rows directly."""
    async with app.state.sessionmaker() as session:
        yield session
    await app.state.engine.dispose()


# docs/04 shared test vectors. TEST KEYS ONLY: seeds stay in the vectors file and tests, never app/.
@pytest.fixture(scope="session")
def vectors() -> dict[str, Any]:
    path = REPO_ROOT / "content" / "trust" / "test-vectors.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def root_key(vectors: dict[str, Any]) -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(vectors["root_seed_hex"]))


@pytest.fixture(scope="session")
def device_key(vectors: dict[str, Any]) -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(vectors["device_seed_hex"]))
