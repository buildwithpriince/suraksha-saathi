"""T-50: Alembic migrations build exactly the schema in app/db/models.py (on SQLite, D-019)."""

from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from app.db.models import Base

BACKEND = Path(__file__).resolve().parents[1]


def _config(database_url: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    config.attributes["configure_logger"] = False
    return config


def test_upgrade_head_matches_models(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}"

    command.upgrade(_config(url), "head")

    engine = sa.create_engine(url)
    with engine.connect() as connection:
        diff = compare_metadata(
            MigrationContext.configure(connection, opts={"compare_type": True}), Base.metadata
        )
    engine.dispose()
    assert diff == []


def test_downgrade_base_removes_every_table(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}"
    config = _config(url)
    command.upgrade(config, "head")

    command.downgrade(config, "base")

    engine = sa.create_engine(url)
    tables = set(sa.inspect(engine).get_table_names())
    engine.dispose()
    assert tables == {"alembic_version"}


def test_single_head() -> None:
    from alembic.script import ScriptDirectory

    assert len(ScriptDirectory.from_config(_config("sqlite://")).get_heads()) == 1
