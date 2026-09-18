"""docs/06 admin certificate endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import Now, RootPrivateKey, Session
from app.api.errors import ApiError, code_for_status
from app.db.models import Certificate, Site, Worker
from app.schemas.admin import CertificateList, CertificateOut, RevokeRequest, WorkerRef
from app.services.admin_auth import CurrentAdmin
from app.services.cert_status import CertStatus, cert_status
from app.services.compliance import PAGE_SIZE, scoped, status_clause
from app.services.revocations import revoke_certificate

router = APIRouter(tags=["admin"])


def certificate_out(cert: Certificate, worker: Worker, site_code: str, now: int) -> CertificateOut:
    return CertificateOut(
        id=cert.id,
        worker=WorkerRef(id=worker.id, displayName=worker.display_name, site=site_code),
        issuedAt=cert.issued_at,
        expiresAt=cert.expires_at,
        status=cert_status(cert.expires_at, cert.revoked_at, now),
        revokedAt=cert.revoked_at,
        revokedReason=cert.revoked_reason,
    )


@router.get("/certificates")
async def list_certificates(
    admin: CurrentAdmin,
    session: Session,
    now: Now,
    status: CertStatus | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
) -> CertificateList:
    """Newest issued first. `status`: valid | expiring (<= 30 days) | expired | revoked."""
    query = scoped(
        select(Certificate, Worker, Site.code)
        .select_from(Certificate)
        .join(Worker, Certificate.worker_id == Worker.id)
        .join(Site, Worker.site_id == Site.id),
        admin,
        Worker.site_id,
    )
    if status is not None:
        query = query.where(status_clause(status, now))
    total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await session.execute(
            query.order_by(Certificate.issued_at.desc(), Certificate.id.desc())
            .offset((page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
        )
    ).all()
    return CertificateList(
        items=[certificate_out(cert, worker, code, now) for cert, worker, code in rows],
        total=total,
    )


@router.post("/certificates/{certificate_id}/revoke")
async def revoke(
    certificate_id: uuid.UUID,
    body: RevokeRequest,
    admin: CurrentAdmin,
    session: Session,
    root_key: RootPrivateKey,
    now: Now,
) -> CertificateOut:
    """Revoke and re-sign the SR1 list. Already revoked -> 200 unchanged (safe double-click)."""
    cert = await session.get(Certificate, certificate_id)
    worker = await session.get(Worker, cert.worker_id) if cert else None
    if cert is None or worker is None or not admin.can_see_site(worker.site_id):
        raise ApiError(404, code_for_status(404), "Certificate not found")
    site = await session.get(Site, worker.site_id)
    assert site is not None  # foreign key

    await revoke_certificate(
        session, cert, reason=body.reason, revoked_by=admin.user_id, root_key=root_key, now=now
    )
    await session.commit()
    return certificate_out(cert, worker, site.code, now)
