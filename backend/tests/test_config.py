from pathlib import Path

import pytest

from app.config import Settings

LOCAL_COMPOSE_DB = "postgresql://suraksha:suraksha@localhost:5432/suraksha"


def test_defaults_point_at_local_compose_db_and_leave_secrets_unset() -> None:
    settings = Settings(_env_file=None)

    assert settings.database_url == LOCAL_COMPOSE_DB
    assert settings.supabase_url is None
    assert settings.supabase_jwks_url is None
    assert settings.root_signing_key_b64 is None
    assert settings.cors_origins == []


def test_reads_the_env_var_names_from_setup_md(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db.example:5432/app")
    monkeypatch.setenv("SUPABASE_URL", "https://abc.supabase.co")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://abc.supabase.co/auth/v1/.well-known/jwks.json")
    monkeypatch.setenv("ROOT_SIGNING_KEY_B64", "dGVzdC1vbmx5")
    monkeypatch.setenv("CORS_ORIGINS", "https://dashboard.example")

    settings = Settings(_env_file=None)

    assert settings.database_url == "postgresql://u:p@db.example:5432/app"
    assert settings.supabase_url == "https://abc.supabase.co"
    assert settings.supabase_jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
    assert settings.root_signing_key_b64 is not None
    assert settings.root_signing_key_b64.get_secret_value() == "dGVzdC1vbmx5"
    assert settings.cors_origins == ["https://dashboard.example"]


def test_reads_a_dotenv_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("DATABASE_URL=postgresql://from:file@localhost:5432/db\n", encoding="utf-8")

    settings = Settings(_env_file=env_file)

    assert settings.database_url == "postgresql://from:file@localhost:5432/db"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://localhost:5173", ["http://localhost:5173"]),
        (
            "http://localhost:5173, https://suraksha.example",
            ["http://localhost:5173", "https://suraksha.example"],
        ),
        (" a ,, b ,", ["a", "b"]),
    ],
)
def test_cors_origins_are_comma_separated(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: list[str]
) -> None:
    monkeypatch.setenv("CORS_ORIGINS", raw)

    assert Settings(_env_file=None).cors_origins == expected


def test_blank_values_count_as_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    # .env.example ships blank values; copying it verbatim must not produce "" secrets.
    for name in ("SUPABASE_URL", "SUPABASE_JWKS_URL", "ROOT_SIGNING_KEY_B64", "CORS_ORIGINS"):
        monkeypatch.setenv(name, "")

    settings = Settings(_env_file=None)

    assert settings.supabase_url is None
    assert settings.supabase_jwks_url is None
    assert settings.root_signing_key_b64 is None
    assert settings.cors_origins == []


def test_root_key_never_appears_in_repr_str_or_dump(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_key = "dGhpcy1pcy1hLWZha2Uta2V5"
    monkeypatch.setenv("ROOT_SIGNING_KEY_B64", fake_key)

    settings = Settings(_env_file=None)

    assert fake_key not in repr(settings)
    assert fake_key not in str(settings)
    assert fake_key not in settings.model_dump_json()
