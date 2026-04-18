"""security hardening: refresh-token rotation, OTP attempts, login lockout, notifications

Revision ID: 20260415_0006
Revises: 20260413_0005
Create Date: 2026-04-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260415_0006"
down_revision = "20260413_0005"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return name in inspector.get_table_names()


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(idx["name"] == name for idx in inspector.get_indexes(table))


def _safe_create_index(
    name: str,
    table: str,
    columns: list[str],
    unique: bool = False,
    **kwargs,
) -> None:
    if not _has_index(table, name):
        op.create_index(name, table, columns, unique=unique, **kwargs)


def upgrade() -> None:
    # ── Users.password_changed_at ──────────────────────────────────────────
    if _has_table("users") and not _has_column("users", "password_changed_at"):
        op.add_column(
            "users",
            sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        )

    # ── OTPToken.attempts ──────────────────────────────────────────────────
    if _has_table("otp_tokens") and not _has_column("otp_tokens", "attempts"):
        op.add_column(
            "otp_tokens",
            sa.Column(
                "attempts",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )

    # ── Refresh tokens table (rotation + theft detection) ──────────────────
    if not _has_table("refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("jti", sa.String(64), nullable=False, unique=True),
            sa.Column("family_id", sa.String(36), nullable=False),
            sa.Column(
                "issued_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "revoked",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            ),
            sa.Column("rotated_to_jti", sa.String(64), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
    _safe_create_index(
        "ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"]
    )
    _safe_create_index(
        "ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True
    )
    _safe_create_index(
        "ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"]
    )

    # ── Login attempts (brute-force lockout) ───────────────────────────────
    if not _has_table("login_attempts"):
        op.create_table(
            "login_attempts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("email_hash", sa.String(64), nullable=False),
            sa.Column("ip_hash", sa.String(64), nullable=True),
            sa.Column(
                "success",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
    _safe_create_index(
        "ix_login_attempts_email_hash", "login_attempts", ["email_hash"]
    )
    _safe_create_index("ix_login_attempts_ip_hash", "login_attempts", ["ip_hash"])
    _safe_create_index(
        "ix_login_attempts_created_at", "login_attempts", ["created_at"]
    )

    # ── Notifications (bill reminders, alerts) ────────────────────────────
    if not _has_table("notifications"):
        op.create_table(
            "notifications",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("type", sa.String(64), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("resource_type", sa.String(64), nullable=True),
            sa.Column("resource_id", sa.String(64), nullable=True),
            sa.Column(
                "is_read",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
    _safe_create_index(
        "ix_notifications_user_id", "notifications", ["user_id"]
    )
    _safe_create_index(
        "ix_notifications_created_at", "notifications", ["created_at"]
    )
    _safe_create_index(
        "ix_notifications_user_dedup",
        "notifications",
        ["user_id", "type", "resource_id"],
    )

    # ── Unique partial index on transactions.receipt_id (idempotency) ─────
    bind = op.get_bind()
    dialect = bind.dialect.name
    if _has_table("transactions") and not _has_index(
        "transactions", "ux_transactions_receipt_id"
    ):
        if dialect == "postgresql":
            op.create_index(
                "ux_transactions_receipt_id",
                "transactions",
                ["receipt_id"],
                unique=True,
                postgresql_where=sa.text("receipt_id IS NOT NULL"),
            )
        elif dialect == "sqlite":
            op.create_index(
                "ux_transactions_receipt_id",
                "transactions",
                ["receipt_id"],
                unique=True,
                sqlite_where=sa.text("receipt_id IS NOT NULL"),
            )
        else:
            op.create_index(
                "ux_transactions_receipt_id",
                "transactions",
                ["receipt_id"],
                unique=True,
            )


def downgrade() -> None:
    if _has_index("transactions", "ux_transactions_receipt_id"):
        op.drop_index("ux_transactions_receipt_id", table_name="transactions")

    if _has_table("notifications"):
        op.drop_index("ix_notifications_user_dedup", table_name="notifications")
        op.drop_index("ix_notifications_created_at", table_name="notifications")
        op.drop_index("ix_notifications_user_id", table_name="notifications")
        op.drop_table("notifications")

    if _has_table("login_attempts"):
        op.drop_index("ix_login_attempts_created_at", table_name="login_attempts")
        op.drop_index("ix_login_attempts_ip_hash", table_name="login_attempts")
        op.drop_index("ix_login_attempts_email_hash", table_name="login_attempts")
        op.drop_table("login_attempts")

    if _has_table("refresh_tokens"):
        op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
        op.drop_index("ix_refresh_tokens_jti", table_name="refresh_tokens")
        op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
        op.drop_table("refresh_tokens")

    if _has_column("otp_tokens", "attempts"):
        op.drop_column("otp_tokens", "attempts")

    if _has_column("users", "password_changed_at"):
        op.drop_column("users", "password_changed_at")
