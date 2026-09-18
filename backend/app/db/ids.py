"""UUIDv7 for server-created records (docs/05 conventions). Python 3.12 has no uuid.uuid7."""

import os
import random
import time
import uuid


def uuid7(unix_ms: int | None = None, rng: random.Random | None = None) -> uuid.UUID:
    """RFC 9562 UUIDv7: 48-bit unix milliseconds, then random bits. `rng` makes seeds repeatable."""
    ms = int(time.time() * 1000) if unix_ms is None else unix_ms
    tail = bytearray(rng.randbytes(10) if rng is not None else os.urandom(10))
    raw = bytearray((ms & (2**48 - 1)).to_bytes(6, "big")) + tail
    raw[6] = (raw[6] & 0x0F) | 0x70  # version 7
    raw[8] = (raw[8] & 0x3F) | 0x80  # RFC 9562 variant
    return uuid.UUID(bytes=bytes(raw))
