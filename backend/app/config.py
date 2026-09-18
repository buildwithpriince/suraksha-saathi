from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Backend configuration from env vars (names: SETUP.md section 6, template: .env.example)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,  # blank values copied from .env.example mean "unset"
        extra="ignore",
    )

    # Default matches docker-compose.yml; the async driver scheme is chosen in T-50.
    database_url: str = "postgresql://suraksha:suraksha@localhost:5432/suraksha"
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None
    # Root Ed25519 private key: base64url of the raw 32-byte seed (docs/04, D-014).
    # SecretStr keeps it out of repr/str/dumps.
    # Never log it, never return it.
    root_signing_key_b64: SecretStr | None = None
    # Comma-separated in the env, e.g. "http://localhost:5173,https://<dashboard>.vercel.app"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
