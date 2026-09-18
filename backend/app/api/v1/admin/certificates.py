"""docs/06 admin certificate endpoints."""

import uuid

from fastapi import APIRouter

from app.api.deps import Now, RootPrivateKey, Session
from app.api.errors import ApiError, code_for_status
from app.db.models import Certificate, Site, Worker
from app.schemas.admin import CertificateOut, RevokeRequest, WorkerRef
from app.services.admin_auth import CurrentAdmin
from app.services.cert_status import cert_status
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
