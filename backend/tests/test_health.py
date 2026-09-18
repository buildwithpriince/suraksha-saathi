import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.anyio


async def test_health_returns_ok_without_auth(client: AsyncClient) -> None:
    response = await client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
