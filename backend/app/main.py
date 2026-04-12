"""FastAPI app factory."""
from __future__ import annotations

from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import (
    analytics,
    auth,
    bills,
    budgets,
    categories,
    coach,
    debts,
    feedback,
    integrations,
    receipts,
    savings,
    transactions,
)
from app.api.exceptions import FinloException
from app.config import get_settings
from app.db.session import init_db
from app.utils.logging import LoggingMiddleware, setup_logging

settings = get_settings()

# ── Sentry ──────────────────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.2,
    )

# ── Rate Limiter ─────────────────────────────────────────────────────────────
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],  # Global per-IP rate limit
)


# ── Security Headers Middleware ──────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended security headers to every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: blob:; "
                "connect-src 'self' https://*.supabase.co; "
                "frame-ancestors 'none'"
            )
        return response


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        setup_logging()
        await init_db()
        yield

    _is_prod = settings.ENVIRONMENT == "production"
    app = FastAPI(
        title="Finlo API",
        version="2.0.0",
        description="Finlo — Personal expense tracker with OCR, budgets, bills, debts, savings goals, and AI insights.",
        docs_url=None if _is_prod else "/docs",
        redoc_url=None if _is_prod else "/redoc",
        openapi_url=None if _is_prod else "/openapi.json",
        lifespan=lifespan,
    )

    # ── Middleware (order matters: outermost runs first) ──────────────────────
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )
    app.state.limiter = limiter

    # ── Structured error handlers ────────────────────────────────────────────
    from fastapi.responses import JSONResponse

    @app.exception_handler(FinloException)
    async def finlo_exception_handler(request: Request, exc: FinloException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "status": "error",
                "code": exc.error_code,
                "message": exc.user_message,
                "details": exc.error_details,
            },
        )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={
                "status": "error",
                "code": "RATE_LIMITED",
                "message": "Too many requests. Please wait a moment and try again.",
                "details": {},
            },
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "code": "VALIDATION_ERROR",
                "message": str(exc),
                "details": {},
            },
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(auth.router, prefix="/auth", tags=["Auth"])
    app.include_router(receipts.router, tags=["Receipts"])
    app.include_router(transactions.router, prefix="/transactions", tags=["Transactions"])
    app.include_router(categories.router, prefix="/categories", tags=["Categories"])
    app.include_router(budgets.router, prefix="/budgets", tags=["Budgets"])
    app.include_router(bills.router, prefix="/bills", tags=["Bills"])
    app.include_router(debts.router, prefix="/debts", tags=["Debts"])
    app.include_router(savings.router, prefix="/savings", tags=["Savings"])
    app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
    app.include_router(coach.router, prefix="/coach", tags=["Coach"])
    app.include_router(feedback.router, tags=["Feedback"])
    app.include_router(integrations.router)

    @app.get("/currency/rates", tags=["Currency"])
    async def currency_rates(base: str = "USD") -> dict:
        from app.services.currency import get_exchange_rates
        rates = await get_exchange_rates(base)
        if rates is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=502, detail="Exchange rate service unavailable")
        return {"base": base.upper(), "rates": rates}

    @app.get("/health", tags=["Health"])
    async def health() -> dict:
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    return app


app = create_app()
