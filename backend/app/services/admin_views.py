"""Row -> response mappers shared by several admin routes."""

from app.db.models import Attempt, Worker
from app.schemas.admin import AttemptDetail, AttemptSummary


def attempt_summary(attempt: Attempt, worker: Worker, site_code: str) -> AttemptSummary:
    return AttemptSummary(
        id=attempt.id,
        workerId=worker.id,
        workerName=worker.display_name,
        site=site_code,
        scenarioId=attempt.scenario_id,
        variant=attempt.variant,
        mode=attempt.mode,
        scorePercent=attempt.score_percent,
        passed=attempt.passed,
        flagged=attempt.flagged,
        startedAt=attempt.started_at,
    )


def attempt_detail(attempt: Attempt, worker: Worker, site_code: str) -> AttemptDetail:
    return AttemptDetail(
        **attempt_summary(attempt, worker, site_code).model_dump(),
        durationSec=attempt.duration_sec,
        flagReason=attempt.flag_reason,
        result=attempt.result_json,
        events=attempt.events_json,
    )
