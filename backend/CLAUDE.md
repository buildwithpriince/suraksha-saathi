# backend — FastAPI sync + certificate authority

Loaded when working inside `backend/`. Root `CLAUDE.md` rules still apply.

## Stack
- Python 3.12, `uv` for env/deps, FastAPI, Pydantic v2
- SQLAlchemy 2 (async) + Alembic, PostgreSQL on Supabase
- Auth for admins: Supabase Auth JWT (verify with the project JWKS)
- Crypto: `cryptography` (Ed25519)
- Tests: pytest + httpx AsyncClient; each test gets a fresh SQLite file (D-019). Before relying on new
  SQL, run them against `docker compose` Postgres too (T-59)
- Deploy: Render (web service). Env vars documented in `.env.example` only

## Layout
```
app/
  main.py            # app factory, routers, CORS
  config.py          # pydantic-settings; reads env
  db/                # engine, session, models.py, alembic migrations
  api/v1/            # devices.py, sync.py, content.py, revocations.py, admin/*.py, public.py
  schemas/           # Pydantic models; MUST mirror docs/06-API.md exactly
  services/          # attestation.py, sync_service.py, compliance.py, certificates.py
  crypto/            # ed25519 helpers, base64url, token encode/decode (docs/04)
  tools/             # validate_scenarios.py, gen_root_key.py, seed_demo.py
tests/
```

## Rules
- Every endpoint in `docs/06-API.md` has a Pydantic request/response schema and at least one test.
- Sync endpoints are idempotent on client-generated UUIDs. Re-sending a batch must not duplicate.
- Server never trusts client-reported `passed`; it recomputes pass/fail from the attempt's rule
  results and marks mismatches `flagged=true` (see docs/05).
- The root private key is loaded from env `ROOT_SIGNING_KEY_B64` only. Never log it, never return it.
- Admin routes require a valid Supabase JWT with role `admin` or `supervisor`; public verify routes need none.
- Every model change ships with an Alembic revision. Never edit an applied revision.

## Commands
- Install: `uv sync`
- Run: `uv run fastapi dev app/main.py`
- Tests: `uv run pytest -q`
- Lint/format: `uv run ruff check . && uv run ruff format .`
- New migration: `uv run alembic revision --autogenerate -m "msg"`, then review the generated file
- Seed demo data: `uv run python -m app.tools.seed_demo`
