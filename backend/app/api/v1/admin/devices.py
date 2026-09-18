"""docs/06 admin device endpoints (admin role only, docs/08 /devices)."""

import uuid

from fastapi import APIRouter

from app.api.deps import Now, RootPrivateKey, Session
from app.api.errors import ApiError, code_for_status
from app.db.models import Device, Site
from app.schemas.admin import DeviceOut
from app.services.admin_auth import RequireAdmin
from app.services.attestation import approve_device

router = APIRouter(tags=["admin"])


def device_out(device: Device, site_code: str) -> DeviceOut:
    return DeviceOut(
        id=device.id,
        label=device.label,
        site=site_code,
        status=device.status,  # type: ignore[arg-type]
        lastSeenAt=device.last_seen_at,
        approvedAt=device.approved_at,
    )


@router.post("/devices/{device_id}/approve")
async def approve(
    device_id: uuid.UUID,
    admin: RequireAdmin,
    session: Session,
    root_key: RootPrivateKey,
    now: Now,
) -> DeviceOut:
    """Sign a 365-day SA1 attestation. Calling it again on an approved device renews it."""
    device = await session.get(Device, device_id)
    if device is None:
        raise ApiError(404, code_for_status(404), "Device not found")
    if device.status == "revoked":
        raise ApiError(409, code_for_status(409), "Device is revoked")
    site = await session.get(Site, device.site_id)
    assert site is not None  # foreign key

    approve_device(device, site.code, root_key, now=now, admin_id=admin.user_id)
    await session.commit()
    return device_out(device, site.code)
