"""docs/06 admin attempt endpoints and the CSV export."""

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import Response
from sqlalchemy import Select, func, select

from app.api.deps import Session
from app.api.errors import ApiError, code_for_status
from app.db.models import Attempt, Site, Worker
from app.schemas.admin import AttemptDetail, AttemptList
from app.services.admin_auth import AdminUser, CurrentAdmin
from app.services.admin_views import attempt_detail, attempt_summary
from app.services.compliance import PAGE_SIZE, scoped

router = APIRouter(tags=["admin"])

CSV_COLUMNS = [
    "attempt_id",
    "worker_id",
    "worker_name",
    "site",
    "scenario_id",
    "scenario_version",
    "variant",
    "mode",
    "score_percent",
    "passed",
    "flagged",
    "flag_reason",
    "started_at",
]


def _attempts_query(admin: AdminUser) -> Select[Any]:
    return scoped(
        select(Attempt, Worker, Site.code)
        .select_from(Attempt)
        .join(Worker, Attempt.worker_id == Worker.id)
        .join(Site, Worker.site_id == Site.id),
        admin,
        Worker.site_id,
    )


@router.get("/attempts")
async def list_attempts(
    admin: CurrentAdmin,
    session: Session,
    scenario: str | None = None,
    passed: bool | None = None,
    flagged: bool | None = None,
    site: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
) -> AttemptList:
    """Newest first. `site` (a site code) serves the heatmap's cell click (docs/08)."""
    query = _attempts_query(admin)
    if scenario:
        query = query.where(Attempt.scenario_id == scenario)
    if passed is not None:
        query = query.where(Attempt.passed.is_(passed))
    if flagged is not None:
        query = query.where(Attempt.flagged.is_(flagged))
    if site:
        query = query.where(Site.code == site)
    total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await session.execute(
            query.order_by(Attempt.started_at.desc(), Attempt.id.desc())
            .offset((page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
        )
    ).all()
    return AttemptList(
        items=[attempt_summary(attempt, worker, code) for attempt, worker, code in rows],
        total=total,
    )


@router.get("/attempts/{attempt_id}")
async def get_attempt(
    attempt_id: uuid.UUID, admin: CurrentAdmin, session: Session
) -> AttemptDetail:
    row = (await session.execute(_attempts_query(admin).where(Attempt.id == attempt_id))).first()
    if row is None:
        raise ApiError(404, code_for_status(404), "Attempt not found")
    attempt, worker, code = row
    return attempt_detail(attempt, worker, code)


@router.get("/export/attempts.csv", response_class=Response)
async def export_attempts_csv(
    admin: CurrentAdmin,
    session: Session,
    from_: Annotated[int | None, Query(alias="from", ge=0)] = None,
    to: Annotated[int | None, Query(ge=0)] = None,
    site: str | None = None,
) -> Response:
    """`from`/`to` are unix seconds on started_at, both inclusive; oldest first."""
    query = _attempts_query(admin)
    if from_ is not None:
        query = query.where(Attempt.started_at >= from_)
    if to is not None:
        query = query.where(Attempt.started_at <= to)
    if site:
        query = query.where(Site.code == site)
    rows = (await session.execute(query.order_by(Attempt.started_at, Attempt.id))).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for attempt, worker, code in rows:
        writer.writerow(
            [
                attempt.id,
                worker.id,
                _csv_safe(worker.display_name),
                code,
                attempt.scenario_id,
                attempt.scenario_version,
                attempt.variant,
                attempt.mode,
                attempt.score_percent,
                str(attempt.passed).lower(),
                str(attempt.flagged).lower(),
                _csv_safe(attempt.flag_reason or ""),
                datetime.fromtimestamp(attempt.started_at, UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            ]
        )
    return Response(
        buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="attempts.csv"'},
    )


def _csv_safe(text: str) -> str:
    """Neutralise spreadsheet formulas in free text synced from devices (CSV injection)."""
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text
