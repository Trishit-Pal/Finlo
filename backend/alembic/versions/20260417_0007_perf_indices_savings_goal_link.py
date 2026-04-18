"""performance indices + savings_goal linked_account_id

Revision ID: 20260417_0007
Revises: 20260415_0006
Create Date: 2026-04-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260417_0007"
down_revision = "20260415_0006"
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
    name: str, table: str, columns: list[str], unique: bool = False
) -> None:
    if _has_table(table) and not _has_index(table, name):
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    # ── Recurring rules table ──────────────────────────────────────────────
    if not _has_table("recurring_rules"):
        op.create_table(
            "recurring_rules",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("label", sa.String(255), nullable=False),
            sa.Column("type", sa.String(16), nullable=False, server_default="expense"),
            sa.Column("frequency", sa.String(32), nullable=False, server_default="monthly"),
            sa.Column("expected_amount", sa.Float(), nullable=False),
            sa.Column("next_due_date", sa.String(32), nullable=True),
            sa.Column("category", sa.String(128), nullable=True),
            sa.Column("merchant_pattern", sa.String(255), nullable=True),
            sa.Column("account_id", sa.String(36), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["account_id"], ["accounts.id"], ondelete="SET NULL"
            ),
        )
    _safe_create_index("ix_recurring_rules_user_id", "recurring_rules", ["user_id"])

    # ── Performance indices ────────────────────────────────────────────────

    # transactions: (user_id, category) — analytics category breakdown
    _safe_create_index(
        "ix_transactions_user_category", "transactions", ["user_id", "category"]
    )

    # transactions: (user_id, type) — monthly summary income filter
    _safe_create_index(
        "ix_transactions_user_type", "transactions", ["user_id", "type"]
    )

    # transactions: (user_id, date) — date-range queries
    _safe_create_index(
        "ix_transactions_user_date", "transactions", ["user_id", "date"]
    )

    # bills: (user_id, is_paid, due_date) — upcoming bills + cron
    _safe_create_index(
        "ix_bills_user_paid_due", "bills", ["user_id", "is_paid", "due_date"]
    )

    # insights: (user_id, is_dismissed) — insights list filter
    _safe_create_index(
        "ix_insights_user_dismissed", "insights", ["user_id", "is_dismissed"]
    )

    # refresh_tokens: (user_id, revoked, expires_at) — cleanup query
    _safe_create_index(
        "ix_refresh_tokens_cleanup",
        "refresh_tokens",
        ["user_id", "revoked", "expires_at"],
    )

    # ── SavingsGoal.linked_account_id ─────────────────────────────────────
    if _has_table("savings_goals") and not _has_column(
        "savings_goals", "linked_account_id"
    ):
        op.add_column(
            "savings_goals",
            sa.Column(
                "linked_account_id",
                sa.String(36),
                sa.ForeignKey("accounts.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    _safe_create_index(
        "ix_savings_goals_linked_account", "savings_goals", ["linked_account_id"]
    )


def downgrade() -> None:
    if _has_column("savings_goals", "linked_account_id"):
        if _has_index("savings_goals", "ix_savings_goals_linked_account"):
            op.drop_index(
                "ix_savings_goals_linked_account", table_name="savings_goals"
            )
        op.drop_column("savings_goals", "linked_account_id")

    for idx, tbl in [
        ("ix_refresh_tokens_cleanup", "refresh_tokens"),
        ("ix_insights_user_dismissed", "insights"),
        ("ix_bills_user_paid_due", "bills"),
        ("ix_transactions_user_date", "transactions"),
        ("ix_transactions_user_type", "transactions"),
        ("ix_transactions_user_category", "transactions"),
    ]:
        if _has_index(tbl, idx):
            op.drop_index(idx, table_name=tbl)

    if _has_table("recurring_rules"):
        if _has_index("recurring_rules", "ix_recurring_rules_user_id"):
            op.drop_index("ix_recurring_rules_user_id", table_name="recurring_rules")
        op.drop_table("recurring_rules")
