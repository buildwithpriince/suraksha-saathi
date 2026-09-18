"""POST /v1/sync ingest (docs/05 "Sync ingest rules", D-022).

Items are processed in order in one transaction. Checks that can never succeed on retry run first,
so a permanently bad item is never reported as retryable. Nothing is written for a rejected item.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto.certificates import verify_certificate
from app.db.models import Attempt, Certificate, Device, Site, Worker
from app.schemas.sync import (
    AttemptPayload,
    CertificatePayload,
    RejectedItem,
    SyncItem,
    SyncResponse,
    WorkerPayload,
)
from app.services.content import ContentCatalog
from app.services.scoring import RuleResult, recheck_attempt


class Rejected(Exception):
    def __init__(self, code: str, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass
class SyncContext:
    session: AsyncSession
    device: Device
    device_site: Site
    catalog: ContentCatalog
    root_public_key: Callable[[], Ed25519PublicKey]  # lazy: only certificates need it
    now: int


def _parse[T: BaseModel](model: type[T], payload: dict[str, Any]) -> T:
    try:
        return model.model_validate(payload)
    except ValidationError:
        raise Rejected("invalid_payload") from None


def _uuid(text: str) -> uuid.UUID:
    try:
        return uuid.UUID(text)
    except ValueError:
        raise Rejected("invalid_payload") from None


async def _worker(ctx: SyncContext, item_id: uuid.UUID, raw: dict[str, Any]) -> None:
    payload = _parse(WorkerPayload, raw)
    if payload.siteCode != ctx.device_site.code:  # also covers unknown site codes
        raise Rejected("invalid_payload")

    worker = await ctx.session.get(Worker, item_id)
    if worker is None:
        ctx.session.add(
            Worker(
                id=item_id,
                site_id=ctx.device_site.id,
                display_name=payload.displayName,
                employee_code=payload.employeeCode,
                preferred_lang=payload.preferredLang,
                created_by_device_id=ctx.device.id,
                created_at=ctx.now,
                updated_at=payload.updatedAt,
            )
        )
        return
    if worker.site_id != ctx.device_site.id:
        raise Rejected("invalid_payload")
    # Last write wins by updatedAt; an older or same-age copy is accepted and changes nothing
    if payload.updatedAt > worker.updated_at:
        worker.display_name = payload.displayName
        worker.employee_code = payload.employeeCode
        worker.preferred_lang = payload.preferredLang
        worker.updated_at = payload.updatedAt


async def _attempt(ctx: SyncContext, item_id: uuid.UUID, raw: dict[str, Any]) -> None:
    payload = _parse(AttemptPayload, raw)
    result = payload.result
    if _uuid(result.attemptId) != item_id:
        raise Rejected("invalid_payload")
    scenario = ctx.catalog.scenario(result.scenarioId, result.scenarioVersion)
    if scenario is None:
        raise Rejected("unknown_scenario")
    worker_id = _uuid(payload.workerId)
    result_json, events_json = raw["result"], raw["events"]  # stored exactly as sent

    existing = await ctx.session.get(Attempt, item_id)
    if existing is not None:
        same = (existing.worker_id, existing.result_json, existing.events_json) == (
            worker_id,
            result_json,
            events_json,
        )
        if not same:
            raise Rejected("conflict_immutable")
        return
    if await ctx.session.get(Worker, worker_id) is None:
        raise Rejected("missing_worker", retryable=True)

    recheck = recheck_attempt(
        scenario,
        result.variant,
        [
            RuleResult(r.ruleId, Fraction(r.earned), Fraction(r.max), r.critical, r.passed)
            for r in result.rules
        ],
        events_json,
        reported_score=result.scorePercent,
        reported_passed=result.passed,
        reported_critical_failures=result.criticalFailures,
    )
    ctx.session.add(
        Attempt(
            id=item_id,
            worker_id=worker_id,
            device_id=ctx.device.id,
            scenario_id=result.scenarioId,
            scenario_version=result.scenarioVersion,
            variant=result.variant,
            seed=result.seed,
            mode=result.mode,
            started_at=result.startedAt,
            duration_sec=result.durationSec,
            score_percent=recheck.score_percent,
            passed=recheck.passed,
            result_json=result_json,
            events_json=events_json,
            flagged=bool(recheck.reasons),
            flag_reason=recheck.flag_reason,
            received_at=ctx.now,
        )
    )


async def _certificate(ctx: SyncContext, item_id: uuid.UUID, raw: dict[str, Any]) -> None:
    payload = _parse(CertificatePayload, raw)
    worker_id = _uuid(payload.workerId)
    verification = verify_certificate(
        payload.token, root_public_key=ctx.root_public_key(), now=ctx.now
    )
    cert = verification.certificate
    if cert is None:  # INVALID_* (VALID, EXPIRED and REVOKED all carry the verified body)
        raise Rejected("invalid_certificate")
    if cert.cid.lower() != str(item_id) or cert.wid.lower() != str(worker_id):
        raise Rejected("invalid_certificate")

    existing = await ctx.session.get(Certificate, item_id)
    if existing is not None:
        if (existing.worker_id, existing.token) != (worker_id, payload.token):
            raise Rejected("conflict_immutable")
        return
    worker = await ctx.session.get(Worker, worker_id)
    if worker is None:
        raise Rejected("missing_worker", retryable=True)
    worker_site = await ctx.session.get(Site, worker.site_id)
    if worker_site is None or cert.site != worker_site.code:
        raise Rejected("invalid_certificate")

    ctx.session.add(
        Certificate(
            id=item_id,
            worker_id=worker_id,
            device_id=ctx.device.id,
            token=payload.token,
            issued_at=cert.iat,
            expires_at=cert.exp,
            received_at=ctx.now,
        )
    )


_HANDLERS = {"worker": _worker, "attempt": _attempt, "certificate": _certificate}


async def ingest(ctx: SyncContext, items: list[SyncItem]) -> SyncResponse:
    accepted: list[str] = []
    rejected: list[RejectedItem] = []
    for item in items:
        try:
            await _HANDLERS[item.kind](ctx, _uuid(item.id), item.payload)
            await ctx.session.flush()  # later items in the batch see this one
        except Rejected as reason:
            rejected.append(
                RejectedItem(id=item.id, code=reason.code, retryable=reason.retryable)  # type: ignore[arg-type]
            )
        else:
            accepted.append(item.id)
    await ctx.session.commit()
    return SyncResponse(accepted=accepted, rejected=rejected)
