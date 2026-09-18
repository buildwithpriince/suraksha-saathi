"""Shared FastAPI dependencies: clock, settings, database session, root signing key."""

import time
from typing import Annotated

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ApiError, code_for_status
from app.config import Settings
from app.crypto.keys import InvalidKey, RootKeyNotConfigured, load_root_private_key
from app.db.engine import get_session


def get_now() -> int:
    """Server time in unix seconds. Tests override this dependency to pin the clock."""
    return int(time.time())


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_root_private_key(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Ed25519PrivateKey:
    """The root key for signing SA1/SR1. 503 when unset, without saying anything about the value."""
    try:
        return load_root_private_key(settings)
    except (RootKeyNotConfigured, InvalidKey):
        raise ApiError(
            503, code_for_status(503), "Root signing key is not configured on the server"
        ) from None


def get_root_public_key(
    root_key: Annotated[Ed25519PrivateKey, Depends(get_root_private_key)],
) -> Ed25519PublicKey:
    return root_key.public_key()


Now = Annotated[int, Depends(get_now)]
Session = Annotated[AsyncSession, Depends(get_session)]
RootPrivateKey = Annotated[Ed25519PrivateKey, Depends(get_root_private_key)]
RootPublicKey = Annotated[Ed25519PublicKey, Depends(get_root_public_key)]
