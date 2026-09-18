import base64
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.config import Settings
from app.crypto import base64url
from app.crypto.keys import (
    InvalidKey,
    RootKeyNotConfigured,
    load_root_private_key,
    private_key_from_seed,
    public_key_b64url,
    public_key_from_b64url,
    seed_b64url,
)


def test_seed_round_trip() -> None:
    key = Ed25519PrivateKey.generate()

    restored = private_key_from_seed(seed_b64url(key))

    assert public_key_b64url(restored.public_key()) == public_key_b64url(key.public_key())
    assert len(seed_b64url(key)) == 43


def test_public_key_round_trip() -> None:
    public = Ed25519PrivateKey.generate().public_key()

    assert public_key_b64url(public_key_from_b64url(public_key_b64url(public))) == (
        public_key_b64url(public)
    )


@pytest.mark.parametrize(
    "text",
    ["", "QQ", base64url.encode(b"\x07" * 31), base64url.encode(b"\x07" * 33), "Q+Q", "QQ=="],
)
def test_malformed_keys_are_rejected(text: str) -> None:
    with pytest.raises(InvalidKey):
        public_key_from_b64url(text)
    with pytest.raises(InvalidKey):
        private_key_from_seed(text)


def test_root_key_loads_from_settings(vectors: dict[str, Any]) -> None:
    seed = base64url.encode(bytes.fromhex(vectors["root_seed_hex"]))

    key = load_root_private_key(Settings(_env_file=None, root_signing_key_b64=seed))

    assert public_key_b64url(key.public_key()) == vectors["root_public_key"]


def test_unset_root_key_fails_loudly() -> None:
    with pytest.raises(RootKeyNotConfigured):
        load_root_private_key(Settings(_env_file=None))


@pytest.mark.parametrize(
    "value",
    [
        base64.b64encode(b"\x07" * 32).decode(),  # standard base64 with padding, not base64url
        base64url.encode(b"\x07" * 30),  # wrong length
        "-----BEGIN PRIVATE KEY-----",
    ],
)
def test_malformed_root_key_error_never_contains_the_value(value: str) -> None:
    with pytest.raises(InvalidKey) as excinfo:
        load_root_private_key(Settings(_env_file=None, root_signing_key_b64=value))

    assert value not in str(excinfo.value)
    assert value not in repr(excinfo.value)
