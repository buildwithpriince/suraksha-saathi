"""docs/04 compact tokens: <PREFIX>.<base64url(body JSON)>.<base64url(Ed25519 signature)>.

Signatures cover the ASCII bytes of <PREFIX>.<base64url(body)> exactly as transmitted. Verifiers
split on the LAST dot and never re-serialize JSON.
"""

import json
import math
from enum import StrEnum

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from pydantic import BaseModel

from app.crypto import base64url

SIGNATURE_BYTES = 64


class Prefix(StrEnum):
    ATTESTATION = "SA1"
    CERTIFICATE = "SS1"
    REVOCATION_LIST = "SR1"


class TokenError(Exception):
    """Base class; messages never include token contents."""


class MalformedToken(TokenError):
    """Wrong prefix or shape, non-canonical base64url, or a body that does not parse."""


class BadSignature(TokenError):
    """Well-formed token whose signature does not verify."""


def sign_token(prefix: Prefix, body: BaseModel, private_key: Ed25519PrivateKey) -> str:
    payload = json.dumps(
        body.model_dump(), separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )
    signing_input = f"{prefix}.{base64url.encode(payload.encode('utf-8'))}"
    signature = private_key.sign(signing_input.encode("ascii"))
    return f"{signing_input}.{base64url.encode(signature)}"


def split_token(token: str, prefix: Prefix) -> tuple[bytes, bytes, bytes]:
    """Return (signing input, body bytes, signature) of a well-formed token of this kind."""
    signing_input, sig_dot, signature_text = token.rpartition(".")
    token_prefix, body_dot, body_text = signing_input.partition(".")
    if not sig_dot or not body_dot or token_prefix != prefix or "." in body_text:
        raise MalformedToken(f"not a 3-part {prefix} token")
    try:
        body = base64url.decode(body_text)
        signature = base64url.decode(signature_text)
    except base64url.InvalidBase64:
        raise MalformedToken(f"{prefix} segment is not canonical base64url") from None
    if len(signature) != SIGNATURE_BYTES:
        raise MalformedToken(f"{prefix} signature is not {SIGNATURE_BYTES} bytes")
    # ASCII is guaranteed: the prefix matched and the body passed the base64url alphabet check
    return signing_input.encode("ascii"), body, signature


def _reject_constant(name: str) -> None:
    raise ValueError(f"{name} is not JSON")


def _finite_float(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise ValueError("number overflows to infinity")
    return value


def parse_body[T: BaseModel](body: bytes, body_type: type[T]) -> T:
    """Strict UTF-8 (no BOM), RFC 8259 JSON object, the body's fields with exact JSON types."""
    try:
        # Pydantic's parser accepts NaN/Infinity in ignored fields; JS JSON.parse does not.
        # This pass rejects them anywhere in the body, plus BOMs and invalid UTF-8.
        json.loads(body.decode("utf-8"), parse_constant=_reject_constant, parse_float=_finite_float)
        return body_type.model_validate_json(body)
    except (ValueError, RecursionError):  # includes UnicodeDecodeError and ValidationError
        raise MalformedToken(f"body is not a valid {body_type.__name__}") from None


def verify_signature(public_key: Ed25519PublicKey, signature: bytes, signing_input: bytes) -> None:
    try:
        public_key.verify(signature, signing_input)
    except InvalidSignature:
        raise BadSignature("signature does not verify") from None


def verify_token[T: BaseModel](
    token: str, prefix: Prefix, public_key: Ed25519PublicKey, body_type: type[T]
) -> T:
    """Verify first, then decode the body."""
    signing_input, body, signature = split_token(token, prefix)
    verify_signature(public_key, signature, signing_input)
    return parse_body(body, body_type)
