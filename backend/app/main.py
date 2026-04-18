"""FastAPI app factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app import dependencies
from app.api import (
    accounts,
    analytics,
    auth,
    bills,
    budgets,
    categories,
    coach,
    debts,
    feedback,
    insights,
    integrations,
    notifications,
    receipts,
    recurring,
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
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' https://*.supabase.co; "
            "frame-ancestors 'none'"
        )
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        return response


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        setup_logging()
        await init_db()
        from app.services.http_client import close_http_client, init_http_client
        from app.services.redis_pool import close_redis_pool, init_redis_pool

        await init_redis_pool()
        await init_http_client()
        yield
        await close_http_client()
        await close_redis_pool()

    _is_prod = settings.ENVIRONMENT == "production"
    app = FastAPI(
        title="Finlo API",
        version="2.0.0",
        description=(
            "Finlo — Personal expense tracker with OCR, budgets, "
            "bills, debts, savings goals, and AI insights."
        ),
        docs_url=None if _is_prod else "/docs",
        redoc_url=None if _is_prod else "/redoc",
        openapi_url=None if _is_prod else "/openapi.json",
        lifespan=lifespan,
    )

    # ── Middleware (order matters: outermost runs first) ──────────────────────
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=500)

    # Reject the unsafe `*` + credentials combination (spec-forbidden).
    cors_origins = [o for o in settings.cors_origins if o and o != "*"]
    if not cors_origins:
        raise RuntimeError(
            "BACKEND_CORS_ORIGINS must list explicit origins "
            "when credentials are allowed"
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

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
        import logging

        logging.getLogger("finlo").warning("ValueError: %s", exc)
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "code": "VALIDATION_ERROR",
                "message": "Invalid input. Please check your data and try again.",
                "details": {},
            },
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(auth.router, prefix="/auth", tags=["Auth"])
    app.include_router(receipts.router, tags=["Receipts"])
    app.include_router(
        transactions.router, prefix="/transactions", tags=["Transactions"]
    )
    app.include_router(categories.router, prefix="/categories", tags=["Categories"])
    app.include_router(budgets.router, prefix="/budgets", tags=["Budgets"])
    app.include_router(bills.router, prefix="/bills", tags=["Bills"])
    app.include_router(debts.router, prefix="/debts", tags=["Debts"])
    app.include_router(savings.router, prefix="/savings", tags=["Savings"])
    app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
    app.include_router(coach.router, prefix="/coach", tags=["Coach"])
    app.include_router(accounts.router, prefix="/accounts", tags=["Accounts"])
    app.include_router(insights.router, prefix="/insights", tags=["Insights"])
    app.include_router(
        notifications.router, prefix="/notifications", tags=["Notifications"]
    )
    app.include_router(feedback.router, tags=["Feedback"])
    app.include_router(integrations.router)
    app.include_router(
        recurring.router, prefix="/recurring-rules", tags=["Recurring Rules"]
    )

    @app.get("/currency/rates", tags=["Currency"])
    async def currency_rates(
        base: str = Query("USD", pattern=r"^[A-Z]{3}$"),
    ) -> dict:
        from app.services.currency import get_exchange_rates

        rates = await get_exchange_rates(base)
        if rates is None:
            from fastapi import HTTPException

            raise HTTPException(
                status_code=502, detail="Exchange rate service unavailable"
            )
        return {"base": base.upper(), "rates": rates}

    @app.post("/cron/bill-reminders", tags=["Cron"])
    async def cron_bill_reminders(
        _auth: dependencies.CronAuth, db: dependencies.DB
    ) -> dict:
        """Dispatch bill-due notifications, take daily snapshots, and run cleanup."""
        from datetime import date

        from sqlalchemy import select as sel

        from app.api.notifications import dispatch_bill_reminders
        from app.db.models import Account, BalanceSnapshot, User
        from app.services.cleanup import purge_expired_tokens, purge_old_audit_logs

        rows = (await db.execute(sel(User.id))).scalars().all()
        total = 0
        for uid in rows:
            total += await dispatch_bill_reminders(db, uid)

        # Auto-capture daily balance snapshots for active accounts
        today_str = date.today().isoformat()
        accounts_result = await db.execute(
            sel(Account).where(Account.is_active.is_(True))
        )
        snap_count = 0
        for acct in accounts_result.scalars().all():
            existing = await db.execute(
                sel(BalanceSnapshot).where(
                    BalanceSnapshot.account_id == acct.id,
                    BalanceSnapshot.date == today_str,
                )
            )
            if not existing.scalar_one_or_none():
                db.add(
                    BalanceSnapshot(
                        account_id=acct.id,
                        user_id=acct.user_id,
                        date=today_str,
                        balance=acct.current_balance,
                        notes="auto",
                    )
                )
                snap_count += 1

        # Token and audit-log cleanup
        cleanup_stats = await purge_expired_tokens(db)
        audit_deleted = await purge_old_audit_logs(db)

        await db.commit()
        return {
            "notifications_created": total,
            "users_checked": len(rows),
            "snapshots_created": snap_count,
            "cleanup": {**cleanup_stats, "audit_logs_deleted": audit_deleted},
        }

    @app.get("/metrics", tags=["Observability"])
    async def app_metrics(admin: dependencies.AdminUser) -> dict:
        from app.services.metrics import metrics

        return metrics.snapshot()

    @app.get("/health", tags=["Health"])
    async def health() -> dict:
        checks: dict = {}
        try:
            from app.db.session import AsyncSessionLocal, engine

            async with AsyncSessionLocal() as session:
                from sqlalchemy import text

                await session.execute(text("SELECT 1"))
            checks["database"] = "ok"
            pool = engine.pool
            if hasattr(pool, "size"):
                checks["db_pool"] = {
                    "size": pool.size(),
                    "checked_in": pool.checkedin(),
                    "checked_out": pool.checkedout(),
                    "overflow": pool.overflow(),
                }
        except Exception:
            checks["database"] = "error"

        from app.services.redis_pool import get_redis

        rds = get_redis()
        if rds:
            try:
                await rds.ping()
                checks["redis"] = "ok"
            except Exception:
                checks["redis"] = "error"
        else:
            checks["redis"] = "not_configured"

        overall = "ok" if checks.get("database") == "ok" else "degraded"
        return {"status": overall, "checks": checks}

    return app


app = create_app()
