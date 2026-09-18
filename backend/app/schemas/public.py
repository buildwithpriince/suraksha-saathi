"""docs/06 revocations, content manifest and public verify."""

from pydantic import BaseModel

from app.crypto.certificates import VerifyStatus


class RevocationsResponse(BaseModel):
    token: str  # SR1
    iat: int


class ManifestScenario(BaseModel):
    id: str
    version: int


class ManifestResponse(BaseModel):
    contentVersion: str
    scenarios: list[ManifestScenario]


class ModuleScoreOut(BaseModel):
    id: str
    score: int


class PublicVerifyResponse(BaseModel):
    """Worker fields are omitted unless both signatures verified (VALID, EXPIRED, REVOKED)."""

    status: VerifyStatus
    workerName: str | None = None
    site: str | None = None
    modules: list[ModuleScoreOut] | None = None
    issuedAt: int | None = None
    expiresAt: int | None = None
    checkedAt: int
