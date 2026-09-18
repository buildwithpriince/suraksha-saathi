"""Server tables (docs/05 "Server PostgreSQL"). Times are UTC unix seconds (docs/05 conventions).

Every change here ships with an Alembic revision in app/db/migrations/versions/.
"""

import uuid
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.types import JsonType, UuidList

SECTORS = ("coal", "steel", "mica", "iti")
DEVICE_STATUSES = ("pending", "approved", "revoked")
ATTEMPT_MODES = ("ar", "tabletop")
ADMIN_ROLES = ("admin", "supervisor")


def _one_of(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    # Stable constraint names, so migrations work the same on PostgreSQL and SQLite
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_N_name)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (CheckConstraint(_one_of("sector", SECTORS), name="sector"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)  # e.g. DHN-01
    name: Mapped[str] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(80))
    sector: Mapped[str] = mapped_column(String(16))


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (CheckConstraint(_one_of("status", DEVICE_STATUSES), name="status"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # generated on the device
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id"))
    label: Mapped[str] = mapped_column(String(64))
    public_key: Mapped[str] = mapped_column(String(43))  # base64url raw 32 bytes
    status: Mapped[str] = mapped_column(String(16))
    attestation_token: Mapped[str | None] = mapped_column(Text)
    attestation_expires_at: Mapped[int | None] = mapped_column(BigInteger)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # Supabase auth uid
    approved_at: Mapped[int | None] = mapped_column(BigInteger)
    last_seen_at: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[int] = mapped_column(BigInteger)


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id"), index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    employee_code: Mapped[str | None] = mapped_column(String(40))
    preferred_lang: Mapped[str] = mapped_column(String(8))
    created_by_device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id"))
    created_at: Mapped[int] = mapped_column(BigInteger)
    updated_at: Mapped[int] = mapped_column(BigInteger)


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = (
        CheckConstraint(_one_of("mode", ATTEMPT_MODES), name="mode"),
        Index(None, "scenario_id", "passed"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workers.id"), index=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("devices.id"))
    scenario_id: Mapped[str] = mapped_column(String(32))
    scenario_version: Mapped[int] = mapped_column(Integer)
    variant: Mapped[str] = mapped_column(String(32))
    seed: Mapped[int] = mapped_column(BigInteger)
    mode: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[int] = mapped_column(BigInteger)
    duration_sec: Mapped[float] = mapped_column(Float)
    # Server-recomputed values (D-021); the device's own claims stay in result_json
    score_percent: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    result_json: Mapped[dict[str, Any]] = mapped_column(JsonType)
    events_json: Mapped[list[Any]] = mapped_column(JsonType)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[int] = mapped_column(BigInteger)


class Certificate(Base):
    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # = cid in the token
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workers.id"), index=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("devices.id"))
    token: Mapped[str] = mapped_column(Text)  # full SS1 token as issued
    issued_at: Mapped[int] = mapped_column(BigInteger)
    expires_at: Mapped[int] = mapped_column(BigInteger, index=True)
    revoked_at: Mapped[int | None] = mapped_column(BigInteger)
    revoked_reason: Mapped[str | None] = mapped_column(Text)
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    received_at: Mapped[int] = mapped_column(BigInteger)


class AdminProfile(Base):
    __tablename__ = "admin_profiles"
    __table_args__ = (CheckConstraint(_one_of("role", ADMIN_ROLES), name="role"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # Supabase auth uid
    role: Mapped[str] = mapped_column(String(16))
    site_ids: Mapped[list[uuid.UUID]] = mapped_column(UuidList, default=list)


class RevocationList(Base):
    """Every SR1 the backend signed; the newest row is served (docs/05, D-022)."""

    __tablename__ = "revocation_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(Text)
    iat: Mapped[int] = mapped_column(BigInteger)
