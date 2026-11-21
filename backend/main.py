from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import DIST_DIR, is_production
from .db import get_db, run_migrations
from .errors import (
    AppError,
    app_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from .routers import auth, bar, bookings, crm, finance_hr, memberships, shop
from .seed import seed_database
from .time_utils import now_iso


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db = get_db()
    run_migrations(db)
    seed_database(db, reset=False)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Alpha Sports Club — Sports Club Management API",
        version="2.0.0",
        description="Unified Python FastAPI backend for Alpha Sports Club: courts, memberships, QR scanner, pro shop POS, bar/KDS, CRM, HR & owner analytics.",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    @app.get("/api/health", tags=["System"])
    def health():
        return {
            "status": "ok",
            "service": "alpha-sports-club-api",
            "framework": "fastapi",
            "timestamp": now_iso(),
        }

    api_prefix = "/api/v1"
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(memberships.router, prefix=api_prefix)
    app.include_router(bookings.router, prefix=api_prefix)
    app.include_router(shop.router, prefix=api_prefix)
    app.include_router(bar.router, prefix=api_prefix)
    app.include_router(crm.router, prefix=api_prefix)
    app.include_router(finance_hr.router, prefix=api_prefix)

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def api_not_found(_request: Request, path: str):
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"API endpoint /api/{path} not found.",
                }
            },
        )

    # Serve built React SPA in production
    dist_index = DIST_DIR / "index.html"
    if is_production() and dist_index.exists():
        assets_dir = DIST_DIR / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        src_assets_dir = DIST_DIR / "src" / "assets"
        if src_assets_dir.exists():
            app.mount(
                "/src/assets",
                StaticFiles(directory=str(src_assets_dir)),
                name="src_assets",
            )

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str):
            candidate = (DIST_DIR / full_path).resolve()
            if (
                full_path
                and candidate.is_file()
                and Path(DIST_DIR.resolve()) in candidate.parents
            ):
                return FileResponse(str(candidate))
            return FileResponse(str(dist_index))

    return app


app = create_app()
