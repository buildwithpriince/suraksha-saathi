"""Dashboard certificate status (docs/08 chips, D-025): valid | expiring | expired | revoked."""

from typing import Literal

EXPIRING_WINDOW_SECONDS = 30 * 86400

CertStatus = Literal["valid", "expiring", "expired", "revoked"]
WorkerCertStatus = Literal["valid", "expiring", "expired", "revoked", "none"]

# A worker's chip shows their best certificate
_BEST_FIRST: tuple[CertStatus, ...] = ("valid", "expiring", "expired", "revoked")


def cert_status(expires_at: int, revoked_at: int | None, now: int) -> CertStatus:
    if revoked_at is not None:
        return "revoked"
    if now > expires_at:  # docs/04 step 8
        return "expired"
    if expires_at - now <= EXPIRING_WINDOW_SECONDS:
        return "expiring"
    return "valid"


def worker_cert_status(statuses: list[CertStatus]) -> WorkerCertStatus:
    for status in _BEST_FIRST:
        if status in statuses:
            return status
    return "none"


def days_left(expires_at: int, now: int) -> int:
    return (expires_at - now) // 86400
