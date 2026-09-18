"""docs/04: base64url without padding; decoders are strict and canonical (D-013)."""

import pytest

from app.crypto import base64url
from app.crypto.base64url import InvalidBase64


@pytest.mark.parametrize("data", [b"", b"\x00", b"A", b"AB", b"ABC", b"ABCD", bytes(range(256))])
def test_round_trip(data: bytes) -> None:
    assert base64url.decode(base64url.encode(data)) == data


def test_encode_uses_the_url_alphabet_without_padding() -> None:
    assert base64url.encode(b"\xfb\xff") == "-_8"
    assert base64url.encode(b"A") == "QQ"


def test_decode_accepts_unpadded_input() -> None:
    assert base64url.decode("QQ") == b"A"
    assert base64url.decode("-_8") == b"\xfb\xff"


@pytest.mark.parametrize(
    "text",
    [
        "QR",  # non-zero leftover bits: same byte as "QQ", so not canonical
        "QQ==",  # padding
        "QQ=",
        "Q",  # impossible length (len % 4 == 1)
        "QUJDR",
        "Q+Q",  # standard-alphabet characters
        "Q/Q",
        "Q Q",
        "QQ\n",
        "ÀQ",  # non-ASCII
        "QUJ" + chr(0x0661),  # ARABIC-INDIC DIGIT ONE: a digit, but not ASCII
    ],
)
def test_decode_rejects_invalid_or_non_canonical_input(text: str) -> None:
    with pytest.raises(InvalidBase64):
        base64url.decode(text)
