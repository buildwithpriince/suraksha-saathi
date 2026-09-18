"""docs/06 public and device-or-public endpoints: revocations, content manifest, verify."""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.api.deps import Now, RootPrivateKey, RootPublicKey, Session
from app.crypto.certificates import verify_certificate
from app.schemas.public import (
    ManifestResponse,
    ManifestScenario,
    ModuleScoreOut,
    PublicVerifyResponse,
    RevocationsResponse,
)
from app.services.content import ContentCatalog
from app.services.revocations import current_revocation_list, publish_revocation_list

router = APIRouter()


@router.get("/revocations", tags=["revocations"])
async def revocations(session: Session, root_key: RootPrivateKey, now: Now) -> RevocationsResponse:
    """The newest root-signed SR1. Devices verify it before use (docs/05 sync step 5)."""
    current = await current_revocation_list(session)
    if current is None:  # nothing revoked yet: still serve a signed (empty) list
        current = await publish_revocation_list(session, root_key, now)
        await session.commit()
    return RevocationsResponse(token=current.token, iat=current.iat)


@router.get("/content/manifest", tags=["content"])
async def content_manifest(request: Request) -> ManifestResponse:
    catalog: ContentCatalog = request.app.state.catalog
    return ManifestResponse(
        contentVersion=catalog.content_version,
        scenarios=[ManifestScenario(id=s.id, version=s.version) for s in catalog.latest()],
    )


@router.get("/public/verify", tags=["public"], response_model_exclude_none=True)
async def public_verify(
    token: Annotated[str, Query(min_length=1, max_length=4096)],
    session: Session,
    root_public_key: RootPublicKey,
    now: Now,
) -> PublicVerifyResponse:
    """docs/04 verification with the server clock and the live revocation list."""
    current = await current_revocation_list(session)
    result = verify_certificate(
        token,
        root_public_key=root_public_key,
        now=now,
        revocation_list=current.token if current else None,
    )
    cert = result.certificate
    if cert is None:
        return PublicVerifyResponse(status=result.status, checkedAt=now)
    return PublicVerifyResponse(
        status=result.status,
        workerName=cert.wn,
        site=cert.site,
        modules=[ModuleScoreOut(id=m.id, score=m.s) for m in cert.mods],
        issuedAt=cert.iat,
        expiresAt=cert.exp,
        checkedAt=now,
    )
