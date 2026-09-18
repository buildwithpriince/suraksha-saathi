"""Async engine and sessions. DATABASE_URL is a plain libpq/SQLite URL; the async driver is chosen
here: asyncpg for PostgreSQL (Supabase), aiosqlite for SQLite (tests and Docker-less dev, D-019).
"""

import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from sqlalchemy import URL, event, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_SSL_MODES = {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}


def async_database_url(url: str) -> tuple[URL, dict[str, Any]]:
    """Return (async URL, connect_args) for a `postgresql://` or `sqlite:///` URL."""
    if url.startswith("postgres://"):  # Heroku-style alias some dashboards still print
        url = "postgresql://" + url.removeprefix("postgres://")
    parsed = make_url(url)
    backend = parsed.get_backend_name()
    if backend == "sqlite":
        return parsed.set(drivername="sqlite+aiosqlite"), {}
    if backend != "postgresql":
        raise ValueError(f"DATABASE_URL must be postgresql:// or sqlite:///, got {backend}://")

    connect_args: dict[str, Any] = {
        # Supabase's pooler (PgBouncer, transaction mode) can't keep prepared statements
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
    }
    query = dict(parsed.query)
    ssl_mode = query.pop("sslmode", None)  # libpq spelling; asyncpg takes `ssl`
    if isinstance(ssl_mode, str) and ssl_mode in _SSL_MODES:
        connect_args["ssl"] = ssl_mode
    return parsed.set(drivername="postgresql+asyncpg", query=query), connect_args


def create_engine(database_url: str) -> AsyncEngine:
    url, connect_args = async_database_url(database_url)
    engine = create_async_engine(url, connect_args=connect_args, pool_pre_ping=True)
    if url.get_backend_name() == "sqlite":
        event.listen(engine.sync_engine, "connect", _sqlite_enforce_foreign_keys)
    return engine


def _sqlite_enforce_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request. Endpoints commit explicitly."""
    async with request.app.state.sessionmaker() as session:
        yield session
