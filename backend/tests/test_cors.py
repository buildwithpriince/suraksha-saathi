import pytest
from httpx import AsyncClient

from app.config import Settings

pytestmark = pytest.mark.anyio


async def test_preflight_from_dashboard_origin_is_allowed(
    client: AsyncClient, settings: Settings
) -> None:
    origin = settings.cors_origins[0]

    response = await client.options(
        "/v1/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    # Admin auth is a bearer token, not cookies
    assert "access-control-allow-credentials" not in response.headers


async def test_other_origins_get_no_cors_headers(client: AsyncClient) -> None:
    preflight = await client.options(
        "/v1/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    simple = await client.get("/v1/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in preflight.headers
    assert "access-control-allow-origin" not in simple.headers
