"""docs/06 admin worker endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.api.deps import Now, Session
from app.api.errors import ApiError, code_for_status
from app.db.models import Attempt, Certificate, Site, Worker
from app.schemas.admin import WorkerCertificate, WorkerDetail, WorkerList, WorkerListItem
from app.services.admin_auth import CurrentAdmin
from app.services.admin_views import attempt_summary
from app.services.cert_status import cert_status
from app.services.compliance import PAGE_SIZE, scoped, statuses_by_worker

router = APIRouter(tags=["admin"])


@router.get("/workers")
async def list_workers(
    admin: CurrentAdmin,
    session: Session,
    now: Now,
    site: str | None = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
) -> WorkerList:
    """Sorted by name. `site` is a site code; `q` matches name or employee code."""
    query = scoped(select(Worker, Site.code).join(Site), admin, Worker.site_id)
    if site:
        query = query.where(Site.code == site)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(Worker.display_name.ilike(pattern), Worker.employee_code.ilike(pattern))
        )
    total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await session.execute(
            query.order_by(Worker.display_name, Worker.id)
            .offset((page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
        )
    ).all()

    ids = [worker.id for worker, _ in rows]
    certs = list(await session.scalars(select(Certificate).where(Certificate.worker_id.in_(ids))))
    statuses = statuses_by_worker(certs, now)
    last_attempt = dict(
        (
            await session.execute(
                select(Attempt.worker_id, func.max(Attempt.started_at))
                .where(Attempt.worker_id.in_(ids))
                .group_by(Attempt.worker_id)
            )
        ).all()
    )
    return WorkerList(
        items=[
            WorkerListItem(
                id=worker.id,
                displayName=worker.display_name,
                site=code,
                certStatus=statuses.get(worker.id, "none"),
                lastAttemptAt=last_attempt.get(worker.id),
            )
            for worker, code in rows
        ],
        total=total,
    )


@router.get("/workers/{worker_id}")
async def worker_detail(
    worker_id: uuid.UUID, admin: CurrentAdmin, session: Session, now: Now
) -> WorkerDetail:
    worker = await session.get(Worker, worker_id)
    if worker is None or not admin.can_see_site(worker.site_id):
        raise ApiError(404, code_for_status(404), "Worker not found")
    site = await session.get(Site, worker.site_id)
    assert site is not None  # foreign key

    attempts = await session.scalars(
        select(Attempt)
        .where(Attempt.worker_id == worker.id)
        .order_by(Attempt.started_at.desc(), Attempt.id.desc())
    )
    certs = list(
        await session.scalars(
            select(Certificate)
            .where(Certificate.worker_id == worker.id)
            .order_by(Certificate.issued_at.desc(), Certificate.id.desc())
        )
    )
    return WorkerDetail(
        id=worker.id,
        displayName=worker.display_name,
        employeeCode=worker.employee_code,
        site=site.code,
        preferredLang=worker.preferred_lang,
        certStatus=statuses_by_worker(certs, now).get(worker.id, "none"),
        createdAt=worker.created_at,
        attempts=[attempt_summary(a, worker, site.code) for a in attempts],
        certificates=[
            WorkerCertificate(
                id=c.id,
                issuedAt=c.issued_at,
                expiresAt=c.expires_at,
                status=cert_status(c.expires_at, c.revoked_at, now),
                token=c.token,
            )
            for c in certs
        ],
    )
