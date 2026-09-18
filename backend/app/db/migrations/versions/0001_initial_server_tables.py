"""Initial server tables (docs/05 "Server PostgreSQL") plus revocation_lists (D-022).

Revision ID: 0001
Revises:
Create Date: 2026-09-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

import app.db.types

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _json() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "sites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("district", sa.String(length=80), nullable=False),
        sa.Column("sector", sa.String(length=16), nullable=False),
        sa.CheckConstraint(
            "sector IN ('coal', 'steel', 'mica', 'iti')", name=op.f("ck_sites_sector")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sites")),
        sa.UniqueConstraint("code", name=op.f("uq_sites_code")),
    )
    op.create_table(
        "admin_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("site_ids", app.db.types.UuidList(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'supervisor')", name=op.f("ck_admin_profiles_role")),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_admin_profiles")),
    )
    op.create_table(
        "revocation_lists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("iat", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_revocation_lists")),
    )
    op.create_table(
        "devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("public_key", sa.String(length=43), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("attestation_token", sa.Text(), nullable=True),
        sa.Column("attestation_expires_at", sa.BigInteger(), nullable=True),
        sa.Column("approved_by", sa.Uuid(), nullable=True),
        sa.Column("approved_at", sa.BigInteger(), nullable=True),
        sa.Column("last_seen_at", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'revoked')", name=op.f("ck_devices_status")
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], name=op.f("fk_devices_site_id_sites")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_devices")),
    )
    op.create_table(
        "workers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("employee_code", sa.String(length=40), nullable=True),
        sa.Column("preferred_lang", sa.String(length=8), nullable=False),
        sa.Column("created_by_device_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_device_id"],
            ["devices.id"],
            name=op.f("fk_workers_created_by_device_id_devices"),
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], name=op.f("fk_workers_site_id_sites")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workers")),
    )
    op.create_index(op.f("ix_workers_site_id"), "workers", ["site_id"])
    op.create_table(
        "attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("worker_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("scenario_id", sa.String(length=32), nullable=False),
        sa.Column("scenario_version", sa.Integer(), nullable=False),
        sa.Column("variant", sa.String(length=32), nullable=False),
        sa.Column("seed", sa.BigInteger(), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("started_at", sa.BigInteger(), nullable=False),
        sa.Column("duration_sec", sa.Float(), nullable=False),
        sa.Column("score_percent", sa.Integer(), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("result_json", _json(), nullable=False),
        sa.Column("events_json", _json(), nullable=False),
        sa.Column("flagged", sa.Boolean(), nullable=False),
        sa.Column("flag_reason", sa.Text(), nullable=True),
        sa.Column("received_at", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("mode IN ('ar', 'tabletop')", name=op.f("ck_attempts_mode")),
        sa.ForeignKeyConstraint(
            ["device_id"], ["devices.id"], name=op.f("fk_attempts_device_id_devices")
        ),
        sa.ForeignKeyConstraint(
            ["worker_id"], ["workers.id"], name=op.f("fk_attempts_worker_id_workers")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attempts")),
    )
    op.create_index(op.f("ix_attempts_worker_id"), "attempts", ["worker_id"])
    op.create_index(op.f("ix_attempts_scenario_id_passed"), "attempts", ["scenario_id", "passed"])
    op.create_table(
        "certificates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("worker_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("issued_at", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.Column("revoked_at", sa.BigInteger(), nullable=True),
        sa.Column("revoked_reason", sa.Text(), nullable=True),
        sa.Column("revoked_by", sa.Uuid(), nullable=True),
        sa.Column("received_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["device_id"], ["devices.id"], name=op.f("fk_certificates_device_id_devices")
        ),
        sa.ForeignKeyConstraint(
            ["worker_id"], ["workers.id"], name=op.f("fk_certificates_worker_id_workers")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_certificates")),
    )
    op.create_index(op.f("ix_certificates_worker_id"), "certificates", ["worker_id"])
    op.create_index(op.f("ix_certificates_expires_at"), "certificates", ["expires_at"])


def downgrade() -> None:
    op.drop_table("certificates")
    op.drop_table("attempts")
    op.drop_table("workers")
    op.drop_table("devices")
    op.drop_table("revocation_lists")
    op.drop_table("admin_profiles")
    op.drop_table("sites")
