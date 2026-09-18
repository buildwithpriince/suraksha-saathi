"""docs/06 POST /v1/sync. The envelope is validated as a whole (422 if bad); each item's payload is
validated separately so one bad item is rejected on its own (`invalid_payload`, D-022).
"""

import math
import uuid
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

MAX_ITEMS = 50
MAX_BODY_BYTES = 2 * 1024 * 1024  # docs/06: max body 2 MB


def _uuid_text(value: str) -> str:
    uuid.UUID(value)  # ValueError -> validation error
    return value


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be a finite number")
    return value


UuidText = Annotated[str, AfterValidator(_uuid_text)]
UnixSeconds = Annotated[int, Field(ge=0)]
Points = Annotated[float, Field(ge=0), AfterValidator(_finite)]


# --- envelope ---


class SyncItem(BaseModel):
    kind: Literal["worker", "attempt", "certificate"]
    id: str = Field(min_length=1, max_length=64)  # echoed back exactly as sent
    payload: dict[str, Any]


class SyncRequest(BaseModel):
    items: list[SyncItem] = Field(max_length=MAX_ITEMS)


class RejectedItem(BaseModel):
    id: str
    code: Literal[
        "missing_worker",
        "conflict_immutable",
        "invalid_payload",
        "unknown_scenario",
        "invalid_certificate",
    ]
    retryable: bool


class SyncResponse(BaseModel):
    accepted: list[str]
    rejected: list[RejectedItem]


# --- item payloads (strict: JSON types must match exactly, e.g. no "1" for 1) ---


class _Payload(BaseModel):
    model_config = ConfigDict(strict=True)


class WorkerPayload(_Payload):
    displayName: str = Field(min_length=1, max_length=80)
    employeeCode: str | None = Field(default=None, max_length=40)
    siteCode: str = Field(min_length=1, max_length=16)
    preferredLang: str = Field(pattern=r"^[a-z]{2,3}$")
    updatedAt: UnixSeconds


class RuleResultIn(_Payload):
    ruleId: str = Field(min_length=1, max_length=64)
    earned: Points
    max: Points
    critical: bool
    passed: bool


class AttemptResultIn(_Payload):
    """docs/03 AttemptResult (stored verbatim in result_json): the fields the server reads."""

    model_config = ConfigDict(strict=True, extra="allow")

    attemptId: UuidText
    scenarioId: str = Field(min_length=1, max_length=32)
    scenarioVersion: int = Field(ge=1)
    variant: str = Field(min_length=1, max_length=32)
    seed: int
    mode: Literal["ar", "tabletop"]
    startedAt: UnixSeconds
    durationSec: Points
    scorePercent: int = Field(ge=0, le=100)
    passed: bool
    criticalFailures: list[str]
    rules: list[RuleResultIn] = Field(max_length=100)


class AttemptPayload(_Payload):
    workerId: UuidText
    result: AttemptResultIn
    events: list[dict[str, Any]] = Field(max_length=5000)


class CertificatePayload(_Payload):
    workerId: UuidText
    token: str = Field(min_length=1, max_length=4096)
