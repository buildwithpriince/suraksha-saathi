"""Admin auth (docs/06): Supabase JWT verified with the project JWKS, role from admin_profiles.

Only asymmetric signing keys are accepted (the JWKS route). Projects still on the legacy shared
HS256 secret must switch to JWT signing keys in Supabase (D-025).
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any

import anyio.to_thread
import jwt
from fastapi import Depends, Header, Request

from app.api.deps import Session
from app.api.errors import ApiError, code_for_status
from app.config import Settings
from app.db.models import AdminProfile

ALGORITHMS = ["ES256", "RS256", "EdDSA"]
AUDIENCE = "authenticated"  # Supabase's audience for signed-in users


class JwtVerifier:
    """Verifies a bearer token and returns its claims. `key_for` maps a token to its public key."""

    def __init__(self, key_for: Callable[[str], Any], issuer: str | None) -> None:
        self._key_for = key_for
        self._issuer = issuer

    def verify(self, token: str) -> dict[str, Any]:
        return jwt.decode(
            token,
            self._key_for(token),
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            issuer=self._issuer,
            options={"require": ["exp", "sub"]},
        )


def supabase_verifier(settings: Settings) -> JwtVerifier | None:
    """None when SUPABASE_JWKS_URL is unset: admin routes then answer 503."""
    if not settings.supabase_jwks_url:
        return None
    jwks = jwt.PyJWKClient(settings.supabase_jwks_url, cache_keys=True, lifespan=600)
    issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else None
    return JwtVerifier(lambda token: jwks.get_signing_key_from_jwt(token).key, issuer)


@dataclass(frozen=True)
class AdminUser:
    user_id: uuid.UUID
    role: str  # admin | supervisor
    site_ids: frozenset[uuid.UUID]

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def can_see_site(self, site_id: uuid.UUID) -> bool:
        """Supervisors see only their own sites (docs/06)."""
        return self.is_admin or site_id in self.site_ids


def _unauthorized(message: str) -> ApiError:
    return ApiError(401, code_for_status(401), message)


async def current_admin(
    request: Request,
    session: Session,
    authorization: Annotated[str | None, Header()] = None,
) -> AdminUser:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Missing bearer token")
    verifier: JwtVerifier | None = request.app.state.jwt_verifier
    if verifier is None:
        raise ApiError(503, code_for_status(503), "Admin authentication is not configured")
    try:
        claims = await anyio.to_thread.run_sync(verifier.verify, token.strip())
    except jwt.PyJWKClientConnectionError:
        raise ApiError(503, code_for_status(503), "Cannot reach the auth key server") from None
    except jwt.PyJWTError:
        raise _unauthorized("Invalid or expired token") from None
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except ValueError:
        raise _unauthorized("Invalid or expired token") from None

    profile = await session.get(AdminProfile, user_id)
    if profile is None:
        raise ApiError(403, code_for_status(403), "This account has no dashboard access")
    return AdminUser(user_id, profile.role, frozenset(profile.site_ids))


async def require_admin(user: Annotated[AdminUser, Depends(current_admin)]) -> AdminUser:
    if not user.is_admin:
        raise ApiError(403, code_for_status(403), "Admin role required")
    return user


CurrentAdmin = Annotated[AdminUser, Depends(current_admin)]  # admin or supervisor
RequireAdmin = Annotated[AdminUser, Depends(require_admin)]
