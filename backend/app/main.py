from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import v1
from app.api.errors import install_error_handlers
from app.config import Settings, get_settings
from app.db.engine import create_engine, create_sessionmaker


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    # Creating the engine doesn't connect; the first query does (health stays DB-free, D-011).
    engine = create_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        await engine.dispose()

    app = FastAPI(title="Suraksha Saathi API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = create_sessionmaker(engine)
    # Admin auth is a bearer token (docs/06), so no cookies: allow_credentials stays False.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    app.include_router(v1.router)
    return app


app = create_app()
