from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

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
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 15  # short-lived access token
    JWT_REFRESH_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7-day refresh token

    # ── Security ─────────────────────────────────────────────────────────────
    PII_ENCRYPTION_KEY: str = ""

    # Supabase (optional — leave blank to use local JWT auth)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_JWT_SECRET: Optional[str] = None

    OAUTH_GOOGLE_CLIENT_ID: Optional[str] = None
    OAUTH_GOOGLE_CLIENT_SECRET: Optional[str] = None
    OTP_PROVIDER: str = "mock"

    # Twilio (required when OTP_PROVIDER=twilio)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None

    # Cron endpoint shared secret (set in scheduler, avoids persisting admin JWTs)
    CRON_SECRET: Optional[str] = None

    # ── LLM / AI ─────────────────────────────────────────────────────────────
    # Either LLM_PROVIDER_KEY (single) or LLM_PROVIDER_KEYS (comma-separated)
    # may be set. When both are set, KEYS takes precedence; KEY is appended
    # for back-compat. Rotation quarantines a key on 401/403/429.
    LLM_PROVIDER_KEY: Optional[str] = None
    LLM_PROVIDER_KEYS: str = ""
    LLM_PROVIDER_MODEL: str = "gpt-4o-mini"
    LLM_PROVIDER_BASE_URL: str = "https://api.openai.com/v1"

    EMBEDDING_PROVIDER_KEY: Optional[str] = None
    EMBEDDING_PROVIDER_KEYS: str = ""
    EMBEDDING_PROVIDER_MODEL: str = "text-embedding-3-small"
    EMBEDDING_PROVIDER_BASE_URL: str = "https://api.openai.com/v1"

    # Comma-separated exchange-rate endpoints, each containing "{base}".
    # Tried in order; first successful response wins.
    CURRENCY_API_URLS: str = "https://open.er-api.com/v6/latest/{base}"

    # ── Database Pool ─────────────────────────────────────────────────────────
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 30
    DB_POOL_RECYCLE: int = 1800

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Object Storage ───────────────────────────────────────────────────────
    STORAGE_ENDPOINT: str = "http://localhost:9000"
    STORAGE_ACCESS_KEY: str = "minioadmin"
    STORAGE_SECRET_KEY: str = "minioadmin"
    STORAGE_BUCKET: str = "finance-receipts"
    STORAGE_REGION: str = "us-east-1"
    STORAGE_ENCRYPTION_KEY: str = ""

    # ── Upload Limits ────────────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_UPLOAD_TYPES: str = "image/jpeg,image/png,image/webp,application/pdf"

    # ── Monitoring ───────────────────────────────────────────────────────────
    SENTRY_DSN: Optional[str] = None

    # ── Data Retention ───────────────────────────────────────────────────────
    AUDIT_LOG_RETENTION_DAYS: int = 90  # days before audit_logs rows are pruned

    FEATURE_TRANSACTION_SYNC_EXPERIMENTAL: bool = False
    FEATURE_BANK_AGGREGATOR_CONNECT: bool = False
    FEATURE_EMAIL_STATEMENT_PARSE: bool = False

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",")]

    @staticmethod
    def _merge_csv_and_single(csv: str, single: Optional[str]) -> list[str]:
        """Merge a comma-separated list with a single fallback. Preserves order."""
        out: list[str] = []
        seen: set[str] = set()
        for part in (csv or "").split(","):
            p = part.strip()
            if p and p not in seen:
                out.append(p)
                seen.add(p)
        if single and single.strip() and single.strip() not in seen:
            out.append(single.strip())
        return out

    @property
    def llm_provider_keys(self) -> list[str]:
        return self._merge_csv_and_single(self.LLM_PROVIDER_KEYS, self.LLM_PROVIDER_KEY)

    @property
    def embedding_provider_keys(self) -> list[str]:
        return self._merge_csv_and_single(
            self.EMBEDDING_PROVIDER_KEYS, self.EMBEDDING_PROVIDER_KEY
        )

    @property
    def currency_api_urls(self) -> list[str]:
        return [u.strip() for u in self.CURRENCY_API_URLS.split(",") if u.strip()]

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
        # Allow tests to run with minimal config
        if self.ENVIRONMENT == "test":
            # Provide safe test-only defaults for empty keys
            if not self.JWT_SECRET:
                object.__setattr__(
                    self, "JWT_SECRET", "test-only-jwt-secret-do-not-use"
                )
            if not self.PII_ENCRYPTION_KEY:
                from cryptography.fernet import Fernet

                object.__setattr__(
                    self, "PII_ENCRYPTION_KEY", Fernet.generate_key().decode()
                )
            if not self.STORAGE_ENCRYPTION_KEY:
                object.__setattr__(self, "STORAGE_ENCRYPTION_KEY", "a" * 64)
            return self

        # All non-test environments require real secrets
        required_secrets = {
            "JWT_SECRET": self.JWT_SECRET,
            "PII_ENCRYPTION_KEY": self.PII_ENCRYPTION_KEY,
        }
        missing = [k for k, v in required_secrets.items() if not v]
        if missing:
            raise ValueError(
                f"Missing required secret env vars: "
                f"{', '.join(missing)}. "
                f"Set these in your .env file."
            )

        if self.ENVIRONMENT == "production":
            if "sqlite" in self.DATABASE_URL:
                raise ValueError(
                    "SQLite is not allowed in production."
                )
            if not self.STORAGE_ENCRYPTION_KEY:
                raise ValueError(
                    "STORAGE_ENCRYPTION_KEY is required "
                    "in production."
                )
            # AES-256-GCM requires exactly 32 bytes = 64 hex characters.
            if len(self.STORAGE_ENCRYPTION_KEY) != 64 or not all(
                c in "0123456789abcdefABCDEF" for c in self.STORAGE_ENCRYPTION_KEY
            ):
                raise ValueError(
                    "STORAGE_ENCRYPTION_KEY must be exactly 64 hex characters "
                    "(32 bytes) for AES-256-GCM."
                )
            if self.use_supabase:
                if not self.SUPABASE_SERVICE_ROLE_KEY:
                    raise ValueError(
                        "SUPABASE_SERVICE_ROLE_KEY required "
                        "when Supabase is enabled."
                    )
                if not self.SUPABASE_JWT_SECRET:
                    raise ValueError(
                        "SUPABASE_JWT_SECRET required "
                        "when Supabase is enabled."
                    )

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
