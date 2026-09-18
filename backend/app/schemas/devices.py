"""docs/06 device endpoints."""

import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.crypto.keys import InvalidKey, public_key_from_b64url

DeviceStatus = Literal["pending", "approved", "revoked"]


class RegisterDeviceRequest(BaseModel):
    deviceId: uuid.UUID
    siteCode: str = Field(min_length=1, max_length=16)
    label: str = Field(min_length=1, max_length=64)
    publicKey: str

    @field_validator("publicKey")
    @classmethod
    def _canonical_prime_order_key(cls, value: str) -> str:
        # docs/04 "Keys" + D-015: small-order keys would let anyone forge this device's signatures
        try:
            public_key_from_b64url(value)
        except InvalidKey:
            raise ValueError(
                "must be base64url of a canonical prime-order Ed25519 public key"
            ) from None
        return value


class RegisterDeviceResponse(BaseModel):
    status: DeviceStatus


class AttestationStatusResponse(BaseModel):
    status: DeviceStatus
    attestation: str | None  # SA1 token once approved
    expiresAt: int | None  # attestation expiry, unix seconds
