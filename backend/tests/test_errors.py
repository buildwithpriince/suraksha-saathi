"""Every error uses the docs/06 envelope: {"error": {"code": "snake_case", "message": "..."}}."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel

from app.api.errors import ApiError, code_for_status

pytestmark = pytest.mark.anyio


class _RegisterBody(BaseModel):
    deviceId: str


@pytest.fixture
def app(app: FastAPI) -> FastAPI:
    """The shared app plus test-only routes that trigger each kind of error."""

    @app.post("/_test/validate")
    async def validate(body: _RegisterBody) -> dict[str, str]:
        return {"deviceId": body.deviceId}

    @app.get("/_test/api-error")
    async def api_error() -> None:
        raise ApiError(409, "key_mismatch", "Device id exists with a different key")

    @app.get("/_test/boom")
    async def boom() -> None:
        raise RuntimeError("secret internal detail")

    return app


async def test_unknown_route_is_not_found(client: AsyncClient) -> None:
    response = await client.get("/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Not Found"}}


async def test_wrong_method_is_method_not_allowed_and_keeps_allow_header(
    client: AsyncClient,
) -> None:
    response = await client.post("/v1/health")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"
    assert "GET" in response.headers["allow"]


async def test_validation_error_names_the_field(client: AsyncClient) -> None:
    response = await client.post("/_test/validate", json={})

    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "validation_error", "message": "body.deviceId: Field required"}
    }


async def test_api_error_sets_status_code_and_message(client: AsyncClient) -> None:
    response = await client.get("/_test/api-error")

    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "key_mismatch", "message": "Device id exists with a different key"}
    }


async def test_unhandled_exception_is_internal_error_without_details(app: FastAPI) -> None:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/_test/boom")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "Internal server error"}
    }
    assert "secret" not in response.text


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (400, "bad_request"),
        (401, "unauthorized"),
        (403, "forbidden"),
        (404, "not_found"),
        (405, "method_not_allowed"),
        (409, "conflict"),
        (413, "payload_too_large"),
        (422, "validation_error"),
        (429, "rate_limited"),
        (500, "internal_error"),
        (418, "http_418"),
    ],
)
def test_generic_code_for_status(status: int, code: str) -> None:
    assert code_for_status(status) == code
