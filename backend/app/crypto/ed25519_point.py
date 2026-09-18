"""Ed25519 public key validation: the canonical encoding of a point of prime order L (D-015).

OpenSSL's cofactorless verification accepts small-order public keys, and with those anyone can
forge a signature that verifies (e.g. identity key, R = identity, S = 0) without a private key.
Every honestly generated key is a prime-order point, so nothing legitimate is rejected.

Point arithmetic follows the reference code in RFC 8032 section 6 (extended coordinates).
"""

from functools import lru_cache

_P = 2**255 - 19
_L = 2**252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)

type _Point = tuple[int, int, int, int]  # (X, Y, Z, T) with x = X/Z, y = Y/Z, x*y = T/Z
_IDENTITY: _Point = (0, 1, 1, 0)


def _add(p: _Point, q: _Point) -> _Point:
    # Complete for Ed25519: also correct for doubling and for the identity
    a = (p[1] - p[0]) * (q[1] - q[0]) % _P
    b = (p[1] + p[0]) * (q[1] + q[0]) % _P
    c = 2 * p[3] * q[3] * _D % _P
    d = 2 * p[2] * q[2] % _P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _mul(scalar: int, point: _Point) -> _Point:
    result = _IDENTITY
    while scalar > 0:
        if scalar & 1:
            result = _add(result, point)
        point = _add(point, point)
        scalar >>= 1
    return result


def _is_identity(point: _Point) -> bool:
    return point[0] % _P == 0 and (point[1] - point[2]) % _P == 0


def _decompress(raw: bytes) -> _Point | None:
    """None unless raw is the canonical encoding of a point on the curve."""
    value = int.from_bytes(raw, "little")
    sign = value >> 255
    y = value & ((1 << 255) - 1)
    if y >= _P:
        return None
    x2 = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P) % _P
    if x2 == 0:
        if sign:
            return None  # x = 0 has only one canonical encoding
        return (0, y, 1, 0)
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _SQRT_M1 % _P
    if (x * x - x2) % _P != 0:
        return None  # not on the curve
    if (x & 1) != sign:
        x = _P - x
    return (x, y, 1, x * y % _P)


@lru_cache(maxsize=1024)
def is_prime_order_point(raw: bytes) -> bool:
    """True only for a canonical point P != identity with [L]P = identity."""
    if len(raw) != 32:
        return False
    point = _decompress(raw)
    return point is not None and not _is_identity(point) and _is_identity(_mul(_L, point))
