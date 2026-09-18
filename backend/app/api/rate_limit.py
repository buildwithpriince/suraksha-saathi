"""In-process sliding-window rate limit per client IP (docs/06 register is "rate-limited").

One process on Render, so memory is enough for the prototype. Behind Render's proxy the client IP
comes from X-Forwarded-For via uvicorn's proxy headers (FORWARDED_ALLOW_IPS in render.yaml).
"""

import time
from collections import defaultdict, deque

from fastapi import Request

from app.api.errors import ApiError, code_for_status


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            raise ApiError(429, code_for_status(429), "Too many requests; try again in a minute")
        hits.append(now)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
