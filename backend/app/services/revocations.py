"""Certificate revocation and the root-signed SR1 list (docs/04, docs/06, D-023)."""

import uuid

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto.bodies import RevocationListBody
from app.crypto.tokens import Prefix, sign_token
from app.db.models import Certificate, RevocationList


async def current_revocation_list(session: AsyncSession) -> RevocationList | None:
    return await session.scalar(select(RevocationList).order_by(RevocationList.id.desc()).limit(1))


async def publish_revocation_list(
    session: AsyncSession, root_key: Ed25519PrivateKey, now: int
) -> RevocationList:
    """Sign every revoked cid (sorted, lowercase) into a new SR1 and store it as the newest."""
    revoked = await session.scalars(
        select(Certificate.id).where(Certificate.revoked_at.is_not(None))
    )
    body = RevocationListBody(iat=now, cids=sorted(str(cid) for cid in revoked))
    row = RevocationList(token=sign_token(Prefix.REVOCATION_LIST, body, root_key), iat=now)
    session.add(row)
    await session.flush()
    return row


async def revoke_certificate(
    session: AsyncSession,
    certificate: Certificate,
    *,
    reason: str,
    revoked_by: uuid.UUID,
    root_key: Ed25519PrivateKey,
    now: int,
) -> None:
    """Revoke and re-sign SR1 in the caller's transaction. Revoking twice changes nothing."""
    if certificate.revoked_at is not None:
        return
    certificate.revoked_at = now
    certificate.revoked_reason = reason
    certificate.revoked_by = revoked_by
    await session.flush()
    await publish_revocation_list(session, root_key, now)
