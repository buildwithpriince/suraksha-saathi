"""docs/06 POST /v1/sync."""

from fastapi import APIRouter, Request

from app.api.deps import (
    Now,
    Session,
    get_app_settings,
    get_root_private_key,
    get_root_public_key,
)
from app.api.errors import ApiError, code_for_status
from app.db.models import Site
from app.schemas.sync import MAX_BODY_BYTES, SyncRequest, SyncResponse
from app.services.device_auth import ApprovedDevice
from app.services.sync_service import SyncContext, ingest

router = APIRouter(tags=["sync"])


@router.post("/sync")
async def sync(
    request: Request, device: ApprovedDevice, body: SyncRequest, session: Session, now: Now
) -> SyncResponse:
    """Idempotent on client ids: re-sending a batch never duplicates (docs/05)."""
    if len(await request.body()) > MAX_BODY_BYTES:  # large declared bodies stop in middleware
        raise ApiError(413, code_for_status(413), "Sync body is larger than 2 MB")
    site = await session.get(Site, device.site_id)
    assert site is not None  # foreign key
    settings = get_app_settings(request)
    ctx = SyncContext(
        session=session,
        device=device,
        device_site=site,
        catalog=request.app.state.catalog,
        root_public_key=lambda: get_root_public_key(get_root_private_key(settings)),
        now=now,
    )
    return await ingest(ctx, body.items)
