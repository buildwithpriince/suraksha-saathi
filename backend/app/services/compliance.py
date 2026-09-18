"""Admin read models: supervisor site scoping and dashboard aggregates (docs/06, docs/08, D-025).

Aggregates load the admin's whole scope and compute in Python: portable across PostgreSQL and
SQLite (D-019) and fast enough at prototype scale (tens of sites, thousands of attempts).
"""

import uuid
from collections import Counter
from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from sqlalchemy import Select, and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.db.models import Attempt, Certificate, Site, Worker
from app.services.admin_auth import AdminUser
from app.services.cert_status import (
    EXPIRING_WINDOW_SECONDS,
    CertStatus,
    WorkerCertStatus,
    cert_status,
    days_left,
    worker_cert_status,
)
from app.services.scoring import round_half_away_from_zero

PAGE_SIZE = 25
TOP_FAILED_RULES = 5


def scoped[T: Any](
    query: Select[T], admin: AdminUser, site_column: InstrumentedAttribute
) -> Select[T]:
    """Supervisors see only their `site_ids` (docs/06). Admins see everything."""
    return query if admin.is_admin else query.where(site_column.in_(admin.site_ids))


def percent(part: int, whole: int) -> int:
    return round_half_away_from_zero(Fraction(100 * part, whole)) if whole else 0


def status_clause(status: CertStatus, now: int) -> Any:
    """SQL twin of cert_status(), for filtering and paging certificates in the database."""
    not_revoked = Certificate.revoked_at.is_(None)
    window_end = now + EXPIRING_WINDOW_SECONDS
    return {
        "revoked": Certificate.revoked_at.is_not(None),
        "expired": and_(not_revoked, Certificate.expires_at < now),
        "expiring": and_(
            not_revoked, Certificate.expires_at >= now, Certificate.expires_at <= window_end
        ),
        "valid": and_(not_revoked, Certificate.expires_at > window_end),
    }[status]


def statuses_by_worker(
    certificates: list[Certificate], now: int
) -> dict[uuid.UUID, WorkerCertStatus]:
    grouped: dict[uuid.UUID, list[CertStatus]] = {}
    for cert in certificates:
        grouped.setdefault(cert.worker_id, []).append(
            cert_status(cert.expires_at, cert.revoked_at, now)
        )
    return {worker_id: worker_cert_status(statuses) for worker_id, statuses in grouped.items()}


def is_certified(status: WorkerCertStatus) -> bool:
    return status in ("valid", "expiring")


@dataclass
class Scope:
    """Everything one admin may see, loaded once for the aggregate views."""

    sites: list[Site]
    workers: list[Worker]
    certificates: list[Certificate]
    attempts: list[Attempt]

    @property
    def site_codes(self) -> dict[uuid.UUID, str]:
        return {site.id: site.code for site in self.sites}


async def load_scope(session: AsyncSession, admin: AdminUser, *, attempts: bool = True) -> Scope:
    sites = await session.scalars(scoped(select(Site).order_by(Site.code), admin, Site.id))
    workers = await session.scalars(scoped(select(Worker), admin, Worker.site_id))
    certificates = await session.scalars(
        scoped(select(Certificate).join(Worker), admin, Worker.site_id)
    )
    attempt_rows = (
        await session.scalars(scoped(select(Attempt).join(Worker), admin, Worker.site_id))
        if attempts
        else []
    )
    return Scope(list(sites), list(workers), list(certificates), list(attempt_rows))


def recert_due(scope: Scope, now: int, days: int) -> list[tuple[Worker, Certificate]]:
    """Workers whose newest non-revoked certificate expires within `days` (and hasn't yet).

    A worker who already re-certified has a newer certificate, so an old one expiring doesn't
    make them due.
    """
    latest: dict[uuid.UUID, Certificate] = {}
    for cert in scope.certificates:
        if cert.revoked_at is None and (
            cert.worker_id not in latest or cert.expires_at > latest[cert.worker_id].expires_at
        ):
            latest[cert.worker_id] = cert
    workers = {worker.id: worker for worker in scope.workers}
    due = [
        (workers[worker_id], cert)
        for worker_id, cert in latest.items()
        if 0 <= days_left(cert.expires_at, now) <= days
    ]
    return sorted(due, key=lambda pair: (pair[1].expires_at, pair[0].display_name))


def top_failed_rules(
    attempts: list[Attempt], limit: int = TOP_FAILED_RULES
) -> list[tuple[str, str, int]]:
    """(ruleId, scenarioId, failures), most failed first, from each attempt's rule results."""
    failures: Counter[tuple[str, str]] = Counter()
    for attempt in attempts:
        for rule in attempt.result_json.get("rules", []):
            if isinstance(rule, dict) and rule.get("passed") is False and "ruleId" in rule:
                failures[(str(rule["ruleId"]), attempt.scenario_id)] += 1
    ranked = sorted(failures.items(), key=lambda item: (-item[1], item[0][1], item[0][0]))
    return [(rule_id, scenario_id, count) for (rule_id, scenario_id), count in ranked[:limit]]
