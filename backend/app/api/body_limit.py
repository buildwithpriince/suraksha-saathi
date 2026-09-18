"""Reject requests whose declared Content-Length exceeds the limit before the body is read.

docs/06 caps sync bodies at 2 MB, and no other endpoint takes more. Bodies without a
Content-Length (chunked) are checked again after reading, in the endpoint.
"""

from starlette.types import ASGIApp, Receive, Scope, Send

from app.api.errors import code_for_status, error_response


class BodySizeLimit:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            for name, value in scope["headers"]:
                if name == b"content-length":
                    if not value.isdigit() or int(value) > self.max_bytes:
                        response = error_response(
                            413, code_for_status(413), "Request body is larger than 2 MB"
                        )
                        await response(scope, receive, send)
                        return
                    break
        await self.app(scope, receive, send)
