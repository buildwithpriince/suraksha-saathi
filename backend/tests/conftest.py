import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app

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
def settings() -> Settings:
    # _env_file=None: tests never read a local backend/.env
    return Settings(_env_file=None, cors_origins=["http://localhost:5173"])


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


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
