"""Device keys must be canonical prime-order points; small-order keys allow forgery (D-015)."""

from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app.crypto import base64url
from app.crypto.ed25519_point import is_prime_order_point
from app.crypto.keys import InvalidKey, public_key_from_b64url

P = 2**255 - 19


def _encode(y: int, sign: int) -> bytes:
    return (y | (sign << 255)).to_bytes(32, "little")


# The 8 points of small order (the torsion subgroup), plus non-canonical spellings of some.
SMALL_ORDER_OR_NON_CANONICAL = {
    "identity (order 1)": _encode(1, 0),
    "order 2 (y = -1)": _encode(P - 1, 0),
    "order 4 (y = 0)": _encode(0, 0),
    "order 4 (y = 0, x odd)": _encode(0, 1),
    "order 8 a": bytes.fromhex("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05"),
    "order 8 b": bytes.fromhex("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85"),
    "order 8 c": bytes.fromhex("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a"),
    "order 8 d": bytes.fromhex("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa"),
    "identity with sign bit (non-canonical)": _encode(1, 1),
    "y = p (non-canonical 0)": _encode(P, 0),
    "y = p + 1 (non-canonical 1)": _encode(P + 1, 0),
    "all ones": b"\xff" * 32,
}


def _raw_public(key: Ed25519PrivateKey) -> bytes:
    return key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)


@pytest.mark.parametrize(
    "raw", SMALL_ORDER_OR_NON_CANONICAL.values(), ids=SMALL_ORDER_OR_NON_CANONICAL
)
def test_small_order_and_non_canonical_points_are_rejected(raw: bytes) -> None:
    assert not is_prime_order_point(raw)
    with pytest.raises(InvalidKey):
        public_key_from_b64url(base64url.encode(raw))


def test_mixed_order_point_is_rejected(device_key: Ed25519PrivateKey) -> None:
    # device point + the order-2 point (0, -1) = (-x, -y): same key, plus a torsion component
    value = int.from_bytes(_raw_public(device_key), "little")
    y, sign = value & ((1 << 255) - 1), value >> 255
    mixed = _encode(P - y, 1 - sign)

    assert not is_prime_order_point(mixed)


def test_wrong_length_is_rejected() -> None:
    assert not is_prime_order_point(b"\x01" * 31)
    assert not is_prime_order_point(b"\x01" * 33)


def test_vector_keys_are_accepted(vectors: dict[str, Any]) -> None:
    for name in ("root_public_key", "device_public_key"):
        assert is_prime_order_point(base64url.decode(vectors[name])), name


def test_honestly_generated_keys_are_accepted() -> None:
    for _ in range(25):
        assert is_prime_order_point(_raw_public(Ed25519PrivateKey.generate()))
