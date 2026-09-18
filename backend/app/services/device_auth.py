"""Device signed-request auth (docs/05 "Device authentication", D-023).

Headers: X-Device-Id, X-Timestamp (unix seconds), X-Signature = base64url Ed25519 signature by the
device key over  METHOD "\\n" PATH "\\n" TIMESTAMP "\\n" hex(sha256(body)).
PATH is the URL path without the query string (e.g. /v1/sync); TIMESTAMP is the header text as sent.
The signature is checked before anything about the device's status is revealed.
"""

import hashlib
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Header, Request

from app.api.deps import Now, Session
from app.api.errors import ApiError, code_for_status
from app.crypto import base64url
from app.crypto.keys import InvalidKey, public_key_from_b64url
from app.crypto.tokens import SIGNATURE_BYTES, BadSignature, verify_signature
from app.db.models import Device

MAX_CLOCK_SKEW_SECONDS = 300  # docs/05: reject if |now - ts| > 300


def _unauthorized(message: str) -> ApiError:
    return ApiError(401, code_for_status(401), message)


def signing_message(method: str, path: str, timestamp: str, body: bytes) -> bytes:
    return f"{method}\n{path}\n{timestamp}\n{hashlib.sha256(body).hexdigest()}".encode("ascii")


def device_auth(*allowed_statuses: str) -> Callable[..., Awaitable[Device]]:
    """Dependency factory: a verified device whose status is one of `allowed_statuses`."""

    async def authenticated_device(
        request: Request,
        session: Session,
        now: Now,
        x_device_id: Annotated[str | None, Header()] = None,
        x_timestamp: Annotated[str | None, Header()] = None,
        x_signature: Annotated[str | None, Header()] = None,
    ) -> Device:
        if not (x_device_id and x_timestamp and x_signature):
            raise _unauthorized("Missing device signature headers")
        try:
            device_id = uuid.UUID(x_device_id)
        except ValueError:
            raise _unauthorized("X-Device-Id is not a UUID") from None
        # Digits only: int() would also accept "+1", " 1" and "1_000"
        if not (x_timestamp.isascii() and x_timestamp.isdigit()):
            raise _unauthorized("X-Timestamp is not unix seconds")
        if abs(now - int(x_timestamp)) > MAX_CLOCK_SKEW_SECONDS:
            raise _unauthorized("X-Timestamp is outside the allowed clock skew; check device time")
        try:
            signature = base64url.decode(x_signature)
        except base64url.InvalidBase64:
            raise _unauthorized("X-Signature is not canonical base64url") from None
        if len(signature) != SIGNATURE_BYTES:
            raise _unauthorized("X-Signature is not an Ed25519 signature")

        device = await session.get(Device, device_id)
        if device is None:
            raise _unauthorized("Unknown device; register first")
        try:
            public_key = public_key_from_b64url(device.public_key)
            message = signing_message(
                request.method, request.url.path, x_timestamp, await request.body()
            )
            verify_signature(public_key, signature, message)
        except (InvalidKey, BadSignature):
            raise _unauthorized("Bad device signature") from None

        if device.status not in allowed_statuses:
            reason = "revoked" if device.status == "revoked" else "not approved yet"
            raise ApiError(403, code_for_status(403), f"Device is {reason}")

        device.last_seen_at = now
        await session.commit()
        return device

    return authenticated_device


# Approved devices only (sync and every other device call)
ApprovedDevice = Annotated[Device, Depends(device_auth("approved"))]
# Attestation status: pending devices poll it for approval; revoked ones learn they are revoked
AnyStatusDevice = Annotated[Device, Depends(device_auth("pending", "approved", "revoked"))]
