"""Device attestation (SA1) signing on admin approval (docs/04, docs/06)."""

import uuid

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.crypto.bodies import AttestationBody
from app.crypto.tokens import Prefix, sign_token
from app.db.models import Device

ATTESTATION_VALIDITY_SECONDS = 365 * 86400  # docs/06 approve: 365 days


def approve_device(
    device: Device, site_code: str, root_key: Ed25519PrivateKey, *, now: int, admin_id: uuid.UUID
) -> None:
    """Sign a fresh attestation and mark the device approved. Re-approving renews it."""
    body = AttestationBody(
        did=str(device.id),
        dpk=device.public_key,
        site=site_code,
        iat=now,
        exp=now + ATTESTATION_VALIDITY_SECONDS,
    )
    device.attestation_token = sign_token(Prefix.ATTESTATION, body, root_key)
    device.attestation_expires_at = body.exp
    device.status = "approved"
    device.approved_by = admin_id
    device.approved_at = now
