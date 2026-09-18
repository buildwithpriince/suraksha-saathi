"""docs/06 admin endpoint shapes (the open ones pinned by D-025)."""

import uuid

from pydantic import BaseModel, Field

from app.schemas.devices import DeviceStatus
from app.services.cert_status import CertStatus


class DeviceOut(BaseModel):
    id: uuid.UUID
    label: str
    site: str  # site code
    status: DeviceStatus
    lastSeenAt: int | None
    approvedAt: int | None


class WorkerRef(BaseModel):
    id: uuid.UUID
    displayName: str
    site: str


class CertificateOut(BaseModel):
    id: uuid.UUID
    worker: WorkerRef
    issuedAt: int
    expiresAt: int
    status: CertStatus
    revokedAt: int | None
    revokedReason: str | None


class RevokeRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
