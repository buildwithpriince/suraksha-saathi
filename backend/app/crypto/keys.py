"""Ed25519 keys as base64url text: raw 32-byte seeds and public keys (docs/04 "Keys", D-014)."""

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

from app.config import Settings
from app.crypto import base64url
from app.crypto.ed25519_point import is_prime_order_point

KEY_BYTES = 32


class InvalidKey(ValueError):
    """Key text is not base64url of a raw 32-byte Ed25519 key. Messages never include the text."""


class RootKeyNotConfigured(RuntimeError):
    """ROOT_SIGNING_KEY_B64 is not set."""


def _raw_key(text: str, what: str) -> bytes:
    try:
        raw = base64url.decode(text)
    except base64url.InvalidBase64:
        raise InvalidKey(f"{what} is not base64url without padding") from None
    if len(raw) != KEY_BYTES:
        raise InvalidKey(f"{what} must decode to {KEY_BYTES} bytes, got {len(raw)}")
    return raw


def private_key_from_seed(seed: str) -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(_raw_key(seed, "private key seed"))


def seed_b64url(key: Ed25519PrivateKey) -> str:
    return base64url.encode(key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()))


def public_key_from_b64url(text: str) -> Ed25519PublicKey:
    """Only canonical prime-order points: small-order keys allow keyless forgery (D-015)."""
    raw = _raw_key(text, "public key")
    if not is_prime_order_point(raw):
        raise InvalidKey("public key is not a canonical prime-order Ed25519 point")
    try:
        return Ed25519PublicKey.from_public_bytes(raw)
    except ValueError:
        raise InvalidKey("public key is not a valid Ed25519 key") from None


def public_key_b64url(key: Ed25519PublicKey) -> str:
    return base64url.encode(key.public_bytes(Encoding.Raw, PublicFormat.Raw))


def load_root_private_key(settings: Settings) -> Ed25519PrivateKey:
    """The root signing key from ROOT_SIGNING_KEY_B64. Never log it, never return it."""
    if settings.root_signing_key_b64 is None:
        raise RootKeyNotConfigured("ROOT_SIGNING_KEY_B64 is not set (see backend/.env.example)")
    return private_key_from_seed(settings.root_signing_key_b64.get_secret_value())
