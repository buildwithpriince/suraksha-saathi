"""T-50: database URL handling, column types and UUIDv7 ids."""

import random
import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.schema import CreateTable

from app.db.engine import async_database_url
from app.db.ids import uuid7
from app.db.models import AdminProfile, Attempt, Base, Device, Site, Worker

pytestmark = pytest.mark.anyio


# --- DATABASE_URL -> async driver ---


def test_postgres_url_uses_asyncpg_with_pooler_safe_statement_cache() -> None:
    url, connect_args = async_database_url("postgresql://u:p@db.example.com:6543/postgres")

    assert url.drivername == "postgresql+asyncpg"
    assert url.host == "db.example.com"
    assert url.port == 6543
    assert connect_args["statement_cache_size"] == 0


def test_postgres_alias_scheme_is_accepted() -> None:
    url, _ = async_database_url("postgres://u:p@localhost/db")

    assert url.drivername == "postgresql+asyncpg"


def test_libpq_sslmode_becomes_asyncpg_ssl() -> None:
    url, connect_args = async_database_url("postgresql://u:p@h/db?sslmode=require")

    assert "sslmode" not in url.query
    assert connect_args["ssl"] == "require"


def test_sqlite_url_uses_aiosqlite() -> None:
    url, connect_args = async_database_url("sqlite:///./local.db")

    assert url.drivername == "sqlite+aiosqlite"
    assert url.database == "./local.db"
    assert connect_args == {}


def test_other_databases_are_rejected() -> None:
    with pytest.raises(ValueError, match="postgresql:// or sqlite:///"):
        async_database_url("mysql://u:p@h/db")


# --- UUIDv7 ---


def test_uuid7_has_version_variant_and_timestamp() -> None:
    value = uuid7(unix_ms=1789000000123)

    assert value.version == 7
    assert value.variant == uuid.RFC_4122
    assert int.from_bytes(value.bytes[:6], "big") == 1789000000123


def test_uuid7_sorts_by_time_and_is_repeatable_with_a_seeded_rng() -> None:
    assert uuid7(unix_ms=1000) < uuid7(unix_ms=2000)
    assert uuid7(1000, random.Random(7)) == uuid7(1000, random.Random(7))


# --- Schema on PostgreSQL (compiled, since tests run on SQLite) ---


def test_postgres_ddl_uses_jsonb_and_uuid_array() -> None:
    dialect = postgresql.dialect()
    attempts = str(CreateTable(Attempt.__table__).compile(dialect=dialect))  # type: ignore[arg-type]
    profiles = str(CreateTable(AdminProfile.__table__).compile(dialect=dialect))  # type: ignore[arg-type]

    assert "result_json JSONB NOT NULL" in attempts
    assert "events_json JSONB NOT NULL" in attempts
    assert "site_ids UUID[] NOT NULL" in profiles


def test_docs05_indexes_exist() -> None:
    indexed = {
        (index.table.name, tuple(c.name for c in index.columns))
        for table in Base.metadata.tables.values()
        for index in table.indexes
    }

    assert {
        ("attempts", ("worker_id",)),
        ("attempts", ("scenario_id", "passed")),
        ("certificates", ("expires_at",)),
        ("workers", ("site_id",)),
    } <= indexed


# --- Round trips on the test database ---


async def test_uuid_list_round_trips(db: AsyncSession) -> None:
    site_ids = [uuid7(), uuid7()]
    user_id = uuid7()
    db.add(AdminProfile(user_id=user_id, role="supervisor", site_ids=site_ids))
    await db.commit()
    db.expunge_all()

    profile = await db.get(AdminProfile, user_id)

    assert profile is not None
    assert profile.site_ids == site_ids


async def test_foreign_keys_are_enforced(db: AsyncSession) -> None:
    db.add(
        Worker(
            id=uuid7(),
            site_id=uuid7(),  # no such site
            display_name="Ravi Munda",
            preferred_lang="hi",
            created_at=1,
            updated_at=1,
        )
    )

    with pytest.raises(sa.exc.IntegrityError):
        await db.commit()


async def test_check_constraints_reject_unknown_enum_values(db: AsyncSession) -> None:
    site = Site(id=uuid7(), code="DHN-01", name="Dhanbad", district="Dhanbad", sector="coal")
    db.add(site)
    await db.commit()
    db.add(
        Device(
            id=uuid7(),
            site_id=site.id,
            label="Kiosk",
            public_key="x" * 43,
            status="sleeping",
            created_at=1,
        )
    )

    with pytest.raises(sa.exc.IntegrityError):
        await db.commit()
