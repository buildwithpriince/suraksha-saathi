"""docs/06 admin endpoint shapes (the open ones pinned by D-025)."""

import uuid
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.devices import DeviceStatus
from app.services.cert_status import CertStatus, WorkerCertStatus


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


class CertificateList(BaseModel):
    items: list[CertificateOut]
    total: int


# --- overview, sites, compliance ---


class FailedRule(BaseModel):
    ruleId: str
    scenarioId: str
    failures: int


class Overview(BaseModel):
    workers: int
    certifiedPercent: int  # 0-100: workers whose best certificate is valid or expiring
    attempts7d: int
    recertDue30d: int  # workers whose latest certificate expires within 30 days
    topFailedRules: list[FailedRule]  # top 5


class SiteOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    district: str
    sector: str
    workers: int
    certifiedPercent: int


class HeatmapCell(BaseModel):
    site: str
    scenario: str
    passRate: int | None  # 0-100; null when there are no attempts
    attempts: int


class Heatmap(BaseModel):
    sites: list[str]
    scenarios: list[str]
    cells: list[HeatmapCell]


class RecertDueItem(BaseModel):
    workerId: uuid.UUID
    displayName: str
    site: str
    expiresAt: int
    daysLeft: int


# --- workers and attempts ---


class WorkerListItem(BaseModel):
    id: uuid.UUID
    displayName: str
    site: str
    certStatus: WorkerCertStatus
    lastAttemptAt: int | None


class WorkerList(BaseModel):
    items: list[WorkerListItem]
    total: int


class AttemptSummary(BaseModel):
    id: uuid.UUID
    workerId: uuid.UUID
    workerName: str
    site: str
    scenarioId: str
    variant: str
    mode: str
    scorePercent: int
    passed: bool
    flagged: bool
    startedAt: int


class AttemptList(BaseModel):
    items: list[AttemptSummary]
    total: int


class AttemptDetail(AttemptSummary):
    durationSec: float
    flagReason: str | None
    result: dict[str, Any]  # the AttemptResult exactly as the device sent it (docs/03)
    events: list[Any]


class WorkerCertificate(BaseModel):
    id: uuid.UUID
    issuedAt: int
    expiresAt: int
    status: CertStatus
    token: str  # for the QR preview (docs/08 /workers/:id)


class WorkerDetail(BaseModel):
    id: uuid.UUID
    displayName: str
    employeeCode: str | None
    site: str
    preferredLang: str
    certStatus: WorkerCertStatus
    createdAt: int
    attempts: list[AttemptSummary]  # newest first
    certificates: list[WorkerCertificate]  # newest first
