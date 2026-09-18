from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import v1
from app.api.errors import install_error_handlers
from app.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(title="Suraksha Saathi API", version="0.1.0")
    app.state.settings = settings
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
