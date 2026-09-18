"""docs/04 token bodies. Field order follows the spec, so signing reproduces the shared vectors."""

from pydantic import BaseModel, ConfigDict


class _Body(BaseModel):
    # strict: JSON types must match exactly (a bool is not an int); unknown fields are ignored
    model_config = ConfigDict(strict=True, frozen=True)


class AttestationBody(_Body):
    """SA1, signed by the root key."""

    did: str
    dpk: str  # base64url raw 32-byte device public key
    site: str
    iat: int
    exp: int


class ModuleScore(_Body):
    id: str
    v: int  # scenario version
    s: int  # scorePercent of the passing attempt


class CertificateBody(_Body):
    """SS1, signed by the device key."""

    cid: str
    wid: str
    wn: str
    site: str
    mods: list[ModuleScore]
    iat: int
    exp: int
    lang: str
    att: str  # the full SA1 token


class RevocationListBody(_Body):
    """SR1, signed by the root key."""

    iat: int
    cids: list[str]
