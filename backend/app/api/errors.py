"""docs/06 error envelope: every error is {"error": {"code": "snake_case", "message": "..."}}."""

from collections.abc import Mapping

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.errors import ErrorBody, ErrorResponse

_GENERIC_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
}


def code_for_status(status_code: int) -> str:
    """Generic code for a status. Endpoints raise ApiError when docs/06 names a specific code."""
    return _GENERIC_CODES.get(status_code, f"http_{status_code}")


class ApiError(Exception):
    """Raise from an endpoint to return a specific docs/06 error code, e.g. `missing_worker`."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_response(
    status_code: int, code: str, message: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code, message=message))
    return JSONResponse(body.model_dump(), status_code=status_code, headers=headers)


async def _handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message)


async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Starlette's default detail is the status phrase ("Not Found"); non-string details are dropped.
    message = exc.detail if isinstance(exc.detail, str) and exc.detail else "Error"
    return error_response(
        exc.status_code, code_for_status(exc.status_code), message, headers=exc.headers
    )


async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Field paths and messages only; submitted values are never echoed back.
    message = "; ".join(
        f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}" for error in exc.errors()
    )
    return error_response(422, code_for_status(422), message or "Invalid request")


async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    # No details in the response. Registered for Exception, so Starlette's ServerErrorMiddleware
    # runs it and then re-raises, which is how the server still logs the traceback.
    return error_response(500, code_for_status(500), "Internal server error")


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected_error)
