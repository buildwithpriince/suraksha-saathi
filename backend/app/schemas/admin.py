"""docs/06 admin endpoint shapes (the open ones pinned by D-025)."""

import uuid

from pydantic import BaseModel

from app.schemas.devices import DeviceStatus


class DeviceOut(BaseModel):
    id: uuid.UUID
    label: str
    site: str  # site code
    status: DeviceStatus
    lastSeenAt: int | None
    approvedAt: int | None
