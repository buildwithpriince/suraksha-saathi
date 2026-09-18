from fastapi import APIRouter

from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> HealthResponse:
    """Liveness only: the process is up. Does not touch the database (docs/06, D-011)."""
    return HealthResponse(status="ok")
