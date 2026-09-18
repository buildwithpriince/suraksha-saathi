"""Column types that map to native PostgreSQL types and still run on SQLite (tests, D-019)."""

import uuid
from typing import Any

from sqlalchemy import JSON, Dialect, Uuid
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.types import TypeDecorator, TypeEngine

# jsonb on PostgreSQL (docs/05), JSON text on SQLite
JsonType = JSON().with_variant(JSONB(), "postgresql")


class UuidList(TypeDecorator[list[uuid.UUID]]):
    """`uuid[]` on PostgreSQL (docs/05 admin_profiles.site_ids), a JSON string array elsewhere."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine[Any]:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(ARRAY(Uuid(as_uuid=True)))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: list[uuid.UUID] | None, dialect: Dialect) -> Any:
        if value is None:
            return None
        ids = [v if isinstance(v, uuid.UUID) else uuid.UUID(str(v)) for v in value]
        return ids if dialect.name == "postgresql" else [str(v) for v in ids]

    def process_result_value(self, value: Any, dialect: Dialect) -> list[uuid.UUID] | None:
        if value is None:
            return None
        return [v if isinstance(v, uuid.UUID) else uuid.UUID(v) for v in value]
