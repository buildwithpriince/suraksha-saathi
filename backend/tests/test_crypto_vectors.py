"""docs/04 shared vectors V1-V4: every implementation (C#, Python, TS) must pass these."""

from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.crypto.bodies import AttestationBody, CertificateBody, ModuleScore, RevocationListBody
from app.crypto.certificates import VerifyStatus, verify_certificate
from app.crypto.keys import public_key_b64url, public_key_from_b64url
from app.crypto.tokens import Prefix, sign_token

CASE_IDS = ["V1", "V2", "V3", "V4"]


def test_vector_file_has_exactly_the_four_documented_cases(vectors: dict[str, Any]) -> None:
    assert [case["id"] for case in vectors["cases"]] == CASE_IDS


@pytest.mark.parametrize("case_id", CASE_IDS)
def test_shared_vector(vectors: dict[str, Any], case_id: str) -> None:
    case = next(c for c in vectors["cases"] if c["id"] == case_id)

    result = verify_certificate(
        vectors[case["token"]],
        root_public_key=public_key_from_b64url(vectors["root_public_key"]),
        now=case["now"],
        revocation_list=vectors[case["rev"]] if "rev" in case else None,
    )

    assert result.status is VerifyStatus(case["expected"])


def test_vector_seeds_derive_the_published_public_keys(
    vectors: dict[str, Any], root_key: Ed25519PrivateKey, device_key: Ed25519PrivateKey
) -> None:
    assert public_key_b64url(root_key.public_key()) == vectors["root_public_key"]
    assert public_key_b64url(device_key.public_key()) == vectors["device_public_key"]


# Ed25519 is deterministic, so a correct signer reproduces the vector tokens byte for byte.


def test_signer_reproduces_the_attestation_vector(
    vectors: dict[str, Any], root_key: Ed25519PrivateKey
) -> None:
    body = AttestationBody(
        did="0191f6a0-0000-7000-8000-000000000001",
        dpk=vectors["device_public_key"],
        site="DHN-01",
        iat=1788000000,
        exp=1819536000,
    )

    assert sign_token(Prefix.ATTESTATION, body, root_key) == vectors["att"]


def test_signer_reproduces_the_revocation_list_vector(
    vectors: dict[str, Any], root_key: Ed25519PrivateKey
) -> None:
    body = RevocationListBody(iat=1789500000, cids=["0191f6a0-0000-7000-8000-00000000c001"])

    assert sign_token(Prefix.REVOCATION_LIST, body, root_key) == vectors["rev"]


def test_signer_reproduces_the_certificate_vector(
    vectors: dict[str, Any], device_key: Ed25519PrivateKey
) -> None:
    body = CertificateBody(
        cid="0191f6a0-0000-7000-8000-00000000c001",
        wid="0191f6a0-0000-7000-8000-00000000a001",
        wn="Ravi Munda",
        site="DHN-01",
        mods=[ModuleScore(id="FIRE_01", v=1, s=86), ModuleScore(id="GAS_01", v=1, s=91)],
        iat=1789000000,
        exp=1820536000,
        lang="hi",
        att=vectors["att"],
    )

    token = sign_token(Prefix.CERTIFICATE, body, device_key)

    assert token == vectors["cert"]
    assert len(token) == 807  # docs/04: fits a QR at error correction level M
