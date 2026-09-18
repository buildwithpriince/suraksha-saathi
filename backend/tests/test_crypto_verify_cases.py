"""docs/04 verification algorithm beyond V1-V4: which status each malformed input gets."""

import json
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.crypto import base64url
from app.crypto.bodies import AttestationBody, CertificateBody, ModuleScore, RevocationListBody
from app.crypto.certificates import (
    CertificateVerification,
    RevocationCheck,
    VerifyStatus,
    verify_certificate,
)
from app.crypto.keys import public_key_b64url
from app.crypto.tokens import Prefix, sign_token

NOW = 1789100000
CID = "0191f6a0-0000-7000-8000-00000000c001"
ATT_IAT, ATT_EXP = 1788000000, 1819536000
CERT_IAT, CERT_EXP = 1789000000, 1820536000


def _sign_raw(prefix: str, payload: bytes, key: Ed25519PrivateKey) -> str:
    """Sign arbitrary bytes, independent of the code under test."""
    signing_input = f"{prefix}.{base64url.encode(payload)}"
    return f"{signing_input}.{base64url.encode(key.sign(signing_input.encode('ascii')))}"


def _att(root_key: Ed25519PrivateKey, device_key: Ed25519PrivateKey, **overrides: Any) -> str:
    fields: dict[str, Any] = {
        "did": "0191f6a0-0000-7000-8000-000000000001",
        "dpk": public_key_b64url(device_key.public_key()),
        "site": "DHN-01",
        "iat": ATT_IAT,
        "exp": ATT_EXP,
    }
    return sign_token(Prefix.ATTESTATION, AttestationBody(**(fields | overrides)), root_key)


def _cert_fields(att: str, **overrides: Any) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "cid": CID,
        "wid": "0191f6a0-0000-7000-8000-00000000a001",
        "wn": "Ravi Munda",
        "site": "DHN-01",
        "mods": [{"id": "FIRE_01", "v": 1, "s": 86}, {"id": "GAS_01", "v": 1, "s": 91}],
        "iat": CERT_IAT,
        "exp": CERT_EXP,
        "lang": "hi",
        "att": att,
    }
    return fields | overrides


def _cert(device_key: Ed25519PrivateKey, att: str, **overrides: Any) -> str:
    fields = _cert_fields(att, **overrides)
    fields["mods"] = [ModuleScore(**m) for m in fields["mods"]]
    return sign_token(Prefix.CERTIFICATE, CertificateBody(**fields), device_key)


def _rev(key: Ed25519PrivateKey, cids: list[str], prefix: Prefix = Prefix.REVOCATION_LIST) -> str:
    return sign_token(prefix, RevocationListBody(iat=1789500000, cids=cids), key)


def _verify(
    token: str,
    root_key: Ed25519PrivateKey,
    now: int = NOW,
    revocation_list: str | None = None,
) -> CertificateVerification:
    return verify_certificate(
        token, root_public_key=root_key.public_key(), now=now, revocation_list=revocation_list
    )


@pytest.fixture
def att(root_key: Ed25519PrivateKey, device_key: Ed25519PrivateKey) -> str:
    return _att(root_key, device_key)


@pytest.fixture
def cert(device_key: Ed25519PrivateKey, att: str) -> str:
    return _cert(device_key, att)


def _assert_rejected(result: CertificateVerification, status: VerifyStatus) -> None:
    assert result.status is status
    # docs/06: no worker fields unless both signatures verified
    assert result.certificate is None
    assert result.attestation is None


# ---- VALID baseline --------------------------------------------------------------------------


def test_valid_certificate_exposes_bodies(cert: str, root_key: Ed25519PrivateKey) -> None:
    result = _verify(cert, root_key)

    assert result.status is VerifyStatus.VALID
    assert result.certificate is not None
    assert result.certificate.cid == CID
    assert result.certificate.wn == "Ravi Munda"
    assert result.attestation is not None
    assert result.attestation.did == "0191f6a0-0000-7000-8000-000000000001"


def test_expiry_boundary(cert: str, root_key: Ed25519PrivateKey) -> None:
    assert _verify(cert, root_key, now=CERT_EXP).status is VerifyStatus.VALID
    assert _verify(cert, root_key, now=CERT_EXP + 1).status is VerifyStatus.EXPIRED


# ---- INVALID_FORMAT --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "token",
    ["", ".", "..", "SS1", "SS1..", "SS1.e30.", "SS1.ä.ä", "not a token at all"],
)
def test_garbage_is_invalid_format(token: str, root_key: Ed25519PrivateKey) -> None:
    _assert_rejected(_verify(token, root_key), VerifyStatus.INVALID_FORMAT)


@pytest.mark.parametrize("prefix", ["SA1", "SR1", "SS2", "ss1"])
def test_wrong_prefix_is_invalid_format(
    prefix: str, cert: str, root_key: Ed25519PrivateKey
) -> None:
    token = prefix + cert.removeprefix("SS1")

    _assert_rejected(_verify(token, root_key), VerifyStatus.INVALID_FORMAT)


def test_two_parts_is_invalid_format(cert: str, root_key: Ed25519PrivateKey) -> None:
    _assert_rejected(_verify(cert.rsplit(".", 1)[0], root_key), VerifyStatus.INVALID_FORMAT)


def test_four_parts_is_invalid_format(cert: str, root_key: Ed25519PrivateKey) -> None:
    _assert_rejected(_verify(cert + ".QQ", root_key), VerifyStatus.INVALID_FORMAT)


def test_non_canonical_body_encoding_is_invalid_format(
    cert: str, root_key: Ed25519PrivateKey
) -> None:
    prefix, body, signature = cert.split(".")

    _assert_rejected(
        _verify(f"{prefix}.{body}=.{signature}", root_key), VerifyStatus.INVALID_FORMAT
    )


@pytest.mark.parametrize(
    "signature",
    ["", "QQ", "not+base64", "A" * 84, "A" * 87],  # the last two decode to 63 and 65 bytes
)
def test_malformed_signature_segment_is_invalid_format(
    signature: str, cert: str, root_key: Ed25519PrivateKey
) -> None:
    token = cert.rsplit(".", 1)[0] + "." + signature

    _assert_rejected(_verify(token, root_key), VerifyStatus.INVALID_FORMAT)


@pytest.mark.parametrize(
    "payload",
    [
        b"not json",
        b"\xff\xfe invalid utf-8",
        b"[1, 2, 3]",
        b'"a string"',
        b"[" * 100_000,  # nesting deep enough to hit recursion limits
    ],
    ids=["not-json", "bad-utf8", "array", "string", "deep-nesting"],
)
def test_undecodable_body_is_invalid_format(
    payload: bytes, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    token = _sign_raw("SS1", payload, device_key)

    _assert_rejected(_verify(token, root_key), VerifyStatus.INVALID_FORMAT)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda f: f.pop("cid"),
        lambda f: f.pop("att"),
        lambda f: f.update(iat="1789000000"),  # string, not number
        lambda f: f.update(iat=True),  # bool must not pass as int
        lambda f: f.update(mods=[{"id": "FIRE_01", "v": 1}]),  # module without score
    ],
    ids=["missing-cid", "missing-att", "iat-string", "iat-bool", "mod-missing-score"],
)
def test_body_with_missing_or_mistyped_fields_is_invalid_format(
    mutate: Any, att: str, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    fields = _cert_fields(att)
    mutate(fields)
    token = _sign_raw("SS1", json.dumps(fields, separators=(",", ":")).encode(), device_key)

    _assert_rejected(_verify(token, root_key), VerifyStatus.INVALID_FORMAT)


@pytest.mark.parametrize(
    "extra",
    ['"x":NaN', '"x":Infinity', '"x":-Infinity', '"x":1e400'],
)
def test_non_json_numbers_are_invalid_format_even_in_ignored_fields(
    extra: str, att: str, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    # RFC 8259 has no NaN/Infinity (JS JSON.parse rejects them); 1e400 overflows to infinity
    body = json.dumps(_cert_fields(att), separators=(",", ":"))[:-1] + "," + extra + "}"
    token = _sign_raw("SS1", body.encode(), device_key)

    _assert_rejected(_verify(token, root_key), VerifyStatus.INVALID_FORMAT)


def test_body_with_utf8_bom_is_invalid_format(
    att: str, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    body = json.dumps(_cert_fields(att), separators=(",", ":")).encode()
    token = _sign_raw("SS1", b"\xef\xbb\xbf" + body, device_key)

    _assert_rejected(_verify(token, root_key), VerifyStatus.INVALID_FORMAT)


def test_issued_in_the_future_beyond_skew_is_invalid_format(
    att: str, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    at_limit = _cert(device_key, att, iat=NOW + 300)
    beyond = _cert(device_key, att, iat=NOW + 301)

    assert _verify(at_limit, root_key).status is VerifyStatus.VALID
    _assert_rejected(_verify(beyond, root_key), VerifyStatus.INVALID_FORMAT)


# ---- INVALID_ATTESTATION ---------------------------------------------------------------------


def test_attestation_signed_by_another_key(
    device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    forged_att = _att(Ed25519PrivateKey.generate(), device_key)

    result = _verify(_cert(device_key, forged_att), root_key)

    _assert_rejected(result, VerifyStatus.INVALID_ATTESTATION)


@pytest.mark.parametrize("att_value", ["", "garbage", "SA1.e30.QQ", "SA1..."])
def test_attestation_that_is_not_a_token(
    att_value: str, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    result = _verify(_cert(device_key, att_value), root_key)

    _assert_rejected(result, VerifyStatus.INVALID_ATTESTATION)


def test_attestation_with_wrong_prefix(
    device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    # A root-signed token of another kind must not be accepted as an attestation
    body = AttestationBody(
        did="0191f6a0-0000-7000-8000-000000000001",
        dpk=public_key_b64url(device_key.public_key()),
        site="DHN-01",
        iat=ATT_IAT,
        exp=ATT_EXP,
    )
    wrong_kind = sign_token(Prefix.REVOCATION_LIST, body, root_key)

    result = _verify(_cert(device_key, wrong_kind), root_key)

    _assert_rejected(result, VerifyStatus.INVALID_ATTESTATION)


def test_attestation_body_missing_fields(
    device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    att_without_dpk = _sign_raw("SA1", b'{"did":"x","site":"DHN-01","iat":1,"exp":2}', root_key)

    result = _verify(_cert(device_key, att_without_dpk), root_key)

    _assert_rejected(result, VerifyStatus.INVALID_ATTESTATION)


@pytest.mark.parametrize(
    ("att_iat", "att_exp", "status"),
    [
        (CERT_IAT, ATT_EXP, VerifyStatus.VALID),  # att.iat == cert.iat
        (ATT_IAT, CERT_IAT, VerifyStatus.VALID),  # cert.iat == att.exp
        (CERT_IAT + 1, ATT_EXP, VerifyStatus.INVALID_ATTESTATION),  # issued before attestation
        (ATT_IAT, CERT_IAT - 1, VerifyStatus.INVALID_ATTESTATION),  # issued after it expired
    ],
)
def test_attestation_window_must_cover_issuance(
    att_iat: int,
    att_exp: int,
    status: VerifyStatus,
    device_key: Ed25519PrivateKey,
    root_key: Ed25519PrivateKey,
) -> None:
    att = _att(root_key, device_key, iat=att_iat, exp=att_exp)

    assert _verify(_cert(device_key, att), root_key).status is status


def test_attestation_site_must_match_certificate_site(
    device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    att = _att(root_key, device_key, site="BOK-02")

    _assert_rejected(_verify(_cert(device_key, att), root_key), VerifyStatus.INVALID_ATTESTATION)


@pytest.mark.parametrize(
    "dpk",
    ["not-a-key", "", base64url.encode(b"\x01" * 31), base64url.encode(b"\x01" * 33)],
)
def test_attestation_with_unusable_device_key(
    dpk: str, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    att = _att(root_key, device_key, dpk=dpk)

    _assert_rejected(_verify(_cert(device_key, att), root_key), VerifyStatus.INVALID_ATTESTATION)


def test_small_order_device_key_cannot_mint_certificates(
    root_key: Ed25519PrivateKey, device_key: Ed25519PrivateKey
) -> None:
    # Keyless forgery: with dpk = identity point, R = identity and S = 0 verify for ANY message
    # under cofactorless verification. The attestation is public (inside every QR), so anyone
    # could mint certificates for this site. The key itself must be rejected.
    identity = b"\x01" + b"\x00" * 31
    att = _att(root_key, device_key, dpk=base64url.encode(identity))
    body = json.dumps(_cert_fields(att, wn="Anyone At All"), separators=(",", ":"))
    signing_input = f"SS1.{base64url.encode(body.encode())}"
    forged = f"{signing_input}.{base64url.encode(identity + b'\x00' * 32)}"

    _assert_rejected(_verify(forged, root_key), VerifyStatus.INVALID_ATTESTATION)


# ---- INVALID_SIGNATURE -----------------------------------------------------------------------


def test_certificate_signed_by_a_device_other_than_the_attested_one(
    att: str, root_key: Ed25519PrivateKey
) -> None:
    other_device = Ed25519PrivateKey.generate()

    result = _verify(_cert(other_device, att), root_key)

    _assert_rejected(result, VerifyStatus.INVALID_SIGNATURE)


def test_signature_from_another_certificate_does_not_transfer(
    att: str, device_key: Ed25519PrivateKey, root_key: Ed25519PrivateKey
) -> None:
    genuine = _cert(device_key, att)
    other = _cert(device_key, att, wn="Someone Else")
    spliced = other.rsplit(".", 1)[0] + "." + genuine.rsplit(".", 1)[1]

    _assert_rejected(_verify(spliced, root_key), VerifyStatus.INVALID_SIGNATURE)


# ---- Revocation list -------------------------------------------------------------------------


def test_no_revocation_list_means_status_unknown(cert: str, root_key: Ed25519PrivateKey) -> None:
    result = _verify(cert, root_key)

    assert result.status is VerifyStatus.VALID
    assert result.revocation is RevocationCheck.NO_LIST
    assert result.revocations_iat is None


def test_verified_list_without_the_cid(cert: str, root_key: Ed25519PrivateKey) -> None:
    result = _verify(cert, root_key, revocation_list=_rev(root_key, ["some-other-cid"]))

    assert result.status is VerifyStatus.VALID
    assert result.revocation is RevocationCheck.CHECKED
    assert result.revocations_iat == 1789500000


@pytest.mark.parametrize(
    "bad_list",
    ["garbage", "", "SR1.e30.QQ"],
    ids=["garbage", "empty", "bad-signature-segment"],
)
def test_unverifiable_list_is_ignored_and_reported(
    bad_list: str, cert: str, root_key: Ed25519PrivateKey
) -> None:
    result = _verify(cert, root_key, revocation_list=bad_list)

    assert result.status is VerifyStatus.VALID
    assert result.revocation is RevocationCheck.INVALID_LIST
    assert result.revocations_iat is None


def test_list_signed_by_another_key_cannot_revoke(cert: str, root_key: Ed25519PrivateKey) -> None:
    forged = _rev(Ed25519PrivateKey.generate(), [CID])

    result = _verify(cert, root_key, revocation_list=forged)

    assert result.status is VerifyStatus.VALID
    assert result.revocation is RevocationCheck.INVALID_LIST


def test_list_with_wrong_prefix_cannot_revoke(cert: str, root_key: Ed25519PrivateKey) -> None:
    wrong_kind = _rev(root_key, [CID], prefix=Prefix.ATTESTATION)

    result = _verify(cert, root_key, revocation_list=wrong_kind)

    assert result.status is VerifyStatus.VALID
    assert result.revocation is RevocationCheck.INVALID_LIST


def test_revoked_takes_precedence_over_expired(cert: str, root_key: Ed25519PrivateKey) -> None:
    result = _verify(cert, root_key, now=CERT_EXP + 1, revocation_list=_rev(root_key, [CID]))

    assert result.status is VerifyStatus.REVOKED
    assert result.certificate is not None
    assert result.revocation is RevocationCheck.CHECKED


def test_early_failures_do_not_evaluate_the_list(root_key: Ed25519PrivateKey) -> None:
    result = _verify("garbage", root_key, revocation_list=_rev(root_key, [CID]))

    assert result.revocation is None
