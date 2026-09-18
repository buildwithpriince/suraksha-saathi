"""docs/06 device endpoints."""

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.api.deps import Now, Session
from app.api.errors import ApiError, code_for_status
from app.api.rate_limit import client_ip
from app.db.models import Device, Site
from app.schemas.devices import RegisterDeviceRequest, RegisterDeviceResponse

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/register", status_code=201)
async def register_device(
    body: RegisterDeviceRequest, request: Request, session: Session, now: Now
) -> RegisterDeviceResponse:
    """Public and rate-limited. Re-registering with the same key is a no-op (safe to retry)."""
    request.app.state.register_limiter.check(client_ip(request))

    site = await session.scalar(select(Site).where(Site.code == body.siteCode))
    if site is None:
        raise ApiError(422, code_for_status(422), "body.siteCode: Unknown site code")

    existing = await session.get(Device, body.deviceId)
    if existing is not None:
        if existing.public_key != body.publicKey:
            raise ApiError(409, code_for_status(409), "Device id exists with a different key")
        return RegisterDeviceResponse(status=existing.status)  # type: ignore[arg-type]

    session.add(
        Device(
            id=body.deviceId,
            site_id=site.id,
            label=body.label,
            public_key=body.publicKey,
            status="pending",
            created_at=now,
        )
    )
    await session.commit()
    return RegisterDeviceResponse(status="pending")
