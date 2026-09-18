"""base64url without padding (RFC 4648 section 5), decoded strictly and canonically (D-013)."""

import base64
import binascii
import re

_ALPHABET = re.compile(r"[A-Za-z0-9_-]*")


class InvalidBase64(ValueError):
    """Text is not canonical unpadded base64url."""


def encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def decode(text: str) -> bytes:
    """Accept only A-Z a-z 0-9 - _, no padding, and only the one canonical spelling of the bytes."""
    if not _ALPHABET.fullmatch(text) or len(text) % 4 == 1:
        raise InvalidBase64("not unpadded base64url")
    try:
        data = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except binascii.Error:
        raise InvalidBase64("not unpadded base64url") from None
    # Rejects non-zero leftover bits, e.g. "QR" (which lenient decoders read as "QQ")
    if encode(data) != text:
        raise InvalidBase64("non-canonical base64url")
    return data
