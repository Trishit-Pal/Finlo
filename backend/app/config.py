from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ─────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # ── Database ─────────────────────────────────────────────────────────────
    # Fallback to local SQLite if no environment variable provided
    DATABASE_URL: str = "sqlite+aiosqlite:///./financecoach.db"

    @property
    def get_database_url(self) -> str:
        """Normalize DATABASE_URL for SQLAlchemy async drivers."""
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # sqlite:// → sqlite+aiosqlite:// (aiosqlite driver required for async)
        if url.startswith("sqlite://") and "+aiosqlite" not in url:
            return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return url

    # ── Auth ─────────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 15  # short-lived access token
    JWT_REFRESH_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7-day refresh token

    # ── Security ─────────────────────────────────────────────────────────────
    PII_ENCRYPTION_KEY: str = "5MP_jPvUiaRF0CtBgwAx4_OOR9nZUJq3wQImCG40Iak="

    # Supabase (optional — leave blank to use local JWT auth)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_JWT_SECRET: Optional[str] = None

    OAUTH_GOOGLE_CLIENT_ID: Optional[str] = None
    OAUTH_GOOGLE_CLIENT_SECRET: Optional[str] = None
    OTP_PROVIDER: str = "mock"

    # ── LLM / AI ─────────────────────────────────────────────────────────────
    LLM_PROVIDER_KEY: Optional[str] = None
    LLM_PROVIDER_MODEL: str = "gpt-4o-mini"
    LLM_PROVIDER_BASE_URL: str = "https://api.openai.com/v1"

    EMBEDDING_PROVIDER_KEY: Optional[str] = None
    EMBEDDING_PROVIDER_MODEL: str = "text-embedding-3-small"
    EMBEDDING_PROVIDER_BASE_URL: str = "https://api.openai.com/v1"

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Object Storage ───────────────────────────────────────────────────────
    STORAGE_ENDPOINT: str = "http://localhost:9000"
    STORAGE_ACCESS_KEY: str = "minioadmin"
    STORAGE_SECRET_KEY: str = "minioadmin"
    STORAGE_BUCKET: str = "finance-receipts"
    STORAGE_REGION: str = "us-east-1"
    STORAGE_ENCRYPTION_KEY: str = "0" * 64  # 32 bytes hex

    # ── Upload Limits ────────────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_UPLOAD_TYPES: str = "image/jpeg,image/png,image/webp,application/pdf"

    # ── Monitoring ───────────────────────────────────────────────────────────
    SENTRY_DSN: Optional[str] = None

    FEATURE_TRANSACTION_SYNC_EXPERIMENTAL: bool = False
    FEATURE_BANK_AGGREGATOR_CONNECT: bool = False
    FEATURE_EMAIL_STATEMENT_PARSE: bool = False

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",")]

    @property
    def allowed_upload_types(self) -> list[str]:
        return [t.strip() for t in self.ALLOWED_UPLOAD_TYPES.split(",")]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def use_supabase(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_ANON_KEY)

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.ENVIRONMENT != "production":
            return self

        required_in_prod = {
            "JWT_SECRET": self.JWT_SECRET,
            "DATABASE_URL": self.DATABASE_URL,
            "STORAGE_ENCRYPTION_KEY": self.STORAGE_ENCRYPTION_KEY,
        }
        missing = [key for key, value in required_in_prod.items() if not value]
        if missing:
            raise ValueError(f"Missing required production env vars: {', '.join(missing)}")

        if "sqlite" in self.DATABASE_URL:
            raise ValueError("SQLite is not allowed in production. Set DATABASE_URL to a PostgreSQL connection string.")

        weak_values = {
            "JWT_SECRET": "change-me-in-production",
            "PII_ENCRYPTION_KEY": "5MP_jPvUiaRF0CtBgwAx4_OOR9nZUJq3wQImCG40Iak=",
            "STORAGE_ENCRYPTION_KEY": "0" * 64,
        }
        weak_detected = [key for key, value in weak_values.items() if getattr(self, key) == value]
        if weak_detected:
            raise ValueError(f"Weak default secrets are not allowed in production: {', '.join(weak_detected)}")

        if self.use_supabase and not self.SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required in production when Supabase mode is enabled")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
