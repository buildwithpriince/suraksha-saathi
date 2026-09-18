"""docs/06 admin aggregates: overview KPIs, sites, compliance heatmap, recertification due."""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.api.deps import Now, Session
from app.schemas.admin import (
    FailedRule,
    Heatmap,
    HeatmapCell,
    Overview,
    RecertDueItem,
    SiteOut,
)
from app.services.admin_auth import CurrentAdmin
from app.services.compliance import (
    is_certified,
    load_scope,
    percent,
    recert_due,
    statuses_by_worker,
    top_failed_rules,
)
from app.services.content import ContentCatalog

router = APIRouter(tags=["admin"])

SEVEN_DAYS = 7 * 86400


@router.get("/overview")
async def overview(admin: CurrentAdmin, session: Session, now: Now) -> Overview:
    scope = await load_scope(session, admin)
    statuses = statuses_by_worker(scope.certificates, now)
    certified = sum(1 for w in scope.workers if is_certified(statuses.get(w.id, "none")))
    return Overview(
        workers=len(scope.workers),
        certifiedPercent=percent(certified, len(scope.workers)),
        attempts7d=sum(1 for a in scope.attempts if now - SEVEN_DAYS <= a.started_at <= now),
        recertDue30d=len(recert_due(scope, now, 30)),
        topFailedRules=[
            FailedRule(ruleId=rule_id, scenarioId=scenario_id, failures=count)
            for rule_id, scenario_id, count in top_failed_rules(scope.attempts)
        ],
    )


@router.get("/sites")
async def sites(admin: CurrentAdmin, session: Session, now: Now) -> list[SiteOut]:
    scope = await load_scope(session, admin, attempts=False)
    statuses = statuses_by_worker(scope.certificates, now)
    out = []
    for site in scope.sites:
        workers = [w for w in scope.workers if w.site_id == site.id]
        certified = sum(1 for w in workers if is_certified(statuses.get(w.id, "none")))
        out.append(
            SiteOut(
                id=site.id,
                code=site.code,
                name=site.name,
                district=site.district,
                sector=site.sector,
                workers=len(workers),
                certifiedPercent=percent(certified, len(workers)),
            )
        )
    return out


@router.get("/compliance/heatmap")
async def heatmap(request: Request, admin: CurrentAdmin, session: Session) -> Heatmap:
    """Every site x scenario cell, including empty ones (passRate null), for a full grid."""
    catalog: ContentCatalog = request.app.state.catalog
    scope = await load_scope(session, admin)
    codes = scope.site_codes
    worker_site = {w.id: codes[w.site_id] for w in scope.workers}
    scenario_ids = [s.id for s in catalog.latest()]

    counts: dict[tuple[str, str], list[int]] = {}
    for attempt in scope.attempts:
        cell = counts.setdefault((worker_site[attempt.worker_id], attempt.scenario_id), [0, 0])
        cell[0] += 1
        cell[1] += attempt.passed
    cells = []
    for site in scope.sites:
        for scenario_id in scenario_ids:
            attempts, passed = counts.get((site.code, scenario_id), [0, 0])
            cells.append(
                HeatmapCell(
                    site=site.code,
                    scenario=scenario_id,
                    passRate=percent(passed, attempts) if attempts else None,
                    attempts=attempts,
                )
            )
    return Heatmap(sites=[s.code for s in scope.sites], scenarios=scenario_ids, cells=cells)


@router.get("/recert-due")
async def recertification_due(
    admin: CurrentAdmin,
    session: Session,
    now: Now,
    days: Annotated[int, Query(ge=0, le=365)] = 30,
) -> list[RecertDueItem]:
    scope = await load_scope(session, admin, attempts=False)
    codes = scope.site_codes
    return [
        RecertDueItem(
            workerId=worker.id,
            displayName=worker.display_name,
            site=codes[worker.site_id],
            expiresAt=cert.expires_at,
            daysLeft=(cert.expires_at - now) // 86400,
        )
        for worker, cert in recert_due(scope, now, days)
    ]
