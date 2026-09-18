"""docs/04 certificate verification, used by sync ingest (T-53) and public verify (T-54)."""

from dataclasses import dataclass
from enum import StrEnum

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from app.crypto.bodies import AttestationBody, CertificateBody, RevocationListBody
from app.crypto.keys import InvalidKey, public_key_from_b64url
from app.crypto.tokens import (
    Prefix,
    TokenError,
    parse_body,
    split_token,
    verify_signature,
    verify_token,
)

CLOCK_SKEW_SECONDS = 300


class VerifyStatus(StrEnum):
    """Values are the exact strings of docs/06 GET /v1/public/verify."""

    VALID = "VALID"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    INVALID_FORMAT = "INVALID_FORMAT"
    INVALID_ATTESTATION = "INVALID_ATTESTATION"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"


class RevocationCheck(StrEnum):
    CHECKED = "CHECKED"  # a root-signed list was applied; freshness is revocations_iat
    NO_LIST = "NO_LIST"  # none supplied: revocation status unknown
    INVALID_LIST = "INVALID_LIST"  # failed verification and was ignored: status unknown


@dataclass(frozen=True)
class CertificateVerification:
    status: VerifyStatus
    # Set only when both signatures verified (VALID, EXPIRED, REVOKED); docs/06 omits worker
    # fields otherwise.
    certificate: CertificateBody | None = None
    attestation: AttestationBody | None = None
    # None when verification stopped before the revocation step
    revocation: RevocationCheck | None = None
    revocations_iat: int | None = None


def verify_certificate(
    token: str,
    *,
    root_public_key: Ed25519PublicKey,
    now: int,
    revocation_list: str | None = None,
) -> CertificateVerification:
    """Run the docs/04 verification algorithm (steps 1-9). Returns a status; never raises."""
    # 1. SS1, three canonical parts, body parses as a certificate
    try:
        signing_input, body, signature = split_token(token, Prefix.CERTIFICATE)
        cert = parse_body(body, CertificateBody)
    except TokenError:
        return CertificateVerification(VerifyStatus.INVALID_FORMAT)

    # 2-4. Root-signed attestation that covers the issuance time and site
    try:
        att = verify_token(cert.att, Prefix.ATTESTATION, root_public_key, AttestationBody)
        device_key = public_key_from_b64url(att.dpk)
    except (TokenError, InvalidKey):
        return CertificateVerification(VerifyStatus.INVALID_ATTESTATION)
    if not att.iat <= cert.iat <= att.exp or att.site != cert.site:
        return CertificateVerification(VerifyStatus.INVALID_ATTESTATION)

    # 5. Signed by the attested device key, over the bytes as transmitted
    try:
        verify_signature(device_key, signature, signing_input)
    except TokenError:
        return CertificateVerification(VerifyStatus.INVALID_SIGNATURE)

    # 6. Not issued in the future, beyond the clock skew allowance
    if cert.iat > now + CLOCK_SKEW_SECONDS:
        return CertificateVerification(VerifyStatus.INVALID_FORMAT)

    # 7. Revocation list, applied only if it verifies with the root key
    revocation, revocations = _check_revocation_list(revocation_list, root_public_key)

    def verified(status: VerifyStatus) -> CertificateVerification:
        return CertificateVerification(
            status,
            certificate=cert,
            attestation=att,
            revocation=revocation,
            revocations_iat=revocations.iat if revocations else None,
        )

    if revocations is not None and cert.cid in revocations.cids:
        return verified(VerifyStatus.REVOKED)
    # 8-9.
    if now > cert.exp:
        return verified(VerifyStatus.EXPIRED)
    return verified(VerifyStatus.VALID)


def _check_revocation_list(
    token: str | None, root_public_key: Ed25519PublicKey
) -> tuple[RevocationCheck, RevocationListBody | None]:
    if token is None:
        return RevocationCheck.NO_LIST, None
    try:
        body = verify_token(token, Prefix.REVOCATION_LIST, root_public_key, RevocationListBody)
    except TokenError:
        return RevocationCheck.INVALID_LIST, None
    return RevocationCheck.CHECKED, body
