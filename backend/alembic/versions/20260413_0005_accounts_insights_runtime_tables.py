"""add accounts, import, insights runtime tables

Revision ID: 20260413_0005
Revises: 20260411_0004
Create Date: 2026-04-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260413_0005"
down_revision = "20260411_0004"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return name in inspector.get_table_names()


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {c["name"] for c in inspector.get_columns(table)}


def _safe_create_index(name: str, table: str, columns: list[str], unique: bool = False) -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {idx["name"] for idx in inspector.get_indexes(table)}
    if name not in existing:
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    if not _has_table("accounts"):
        op.create_table(
            "accounts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("name", sa.String(128), nullable=False),
            sa.Column("type", sa.String(32), nullable=False),
            sa.Column("institution_label", sa.String(128), nullable=True),
            sa.Column("last4", sa.String(4), nullable=True),
            sa.Column("opening_balance", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("current_balance", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("currency", sa.String(8), nullable=False, server_default="INR"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
    _safe_create_index("ix_accounts_user_id", "accounts", ["user_id"])
    _safe_create_index("ix_accounts_user_name", "accounts", ["user_id", "name"], unique=True)

    if not _has_table("balance_snapshots"):
        op.create_table(
            "balance_snapshots",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("account_id", sa.String(36), nullable=False),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("date", sa.String(32), nullable=False),
            sa.Column("balance", sa.Float(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
    _safe_create_index("ix_balance_snapshots_account_id", "balance_snapshots", ["account_id"])
    _safe_create_index("ix_balance_snapshots_user_id", "balance_snapshots", ["user_id"])
    _safe_create_index(
        "ix_balance_snapshots_account_date",
        "balance_snapshots",
        ["account_id", "date"],
    )

    if not _has_table("import_batches"):
        op.create_table(
            "import_batches",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("source_type", sa.String(32), nullable=False),
            sa.Column("file_name", sa.String(255), nullable=True),
            sa.Column("row_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("success_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("error_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("column_mapping", sa.JSON(), nullable=True),
            sa.Column("errors_detail", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="completed"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
    _safe_create_index("ix_import_batches_user_id", "import_batches", ["user_id"])

    if not _has_table("insights"):
        op.create_table(
            "insights",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("type", sa.String(64), nullable=False),
            sa.Column("severity", sa.String(16), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("explanation", sa.Text(), nullable=False),
            sa.Column("recommendation", sa.Text(), nullable=True),
            sa.Column("metric_basis", sa.JSON(), nullable=True),
            sa.Column("is_dismissed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
    _safe_create_index("ix_insights_user_id", "insights", ["user_id"])
    _safe_create_index("ix_insights_user_type", "insights", ["user_id", "type"])

    if _has_table("transactions"):
        if not _has_column("transactions", "account_id"):
            op.add_column("transactions", sa.Column("account_id", sa.String(36), nullable=True))
        if not _has_column("transactions", "transfer_to_account_id"):
            op.add_column(
                "transactions",
                sa.Column("transfer_to_account_id", sa.String(36), nullable=True),
            )
        if not _has_column("transactions", "import_batch_id"):
            op.add_column("transactions", sa.Column("import_batch_id", sa.String(36), nullable=True))
        if not _has_column("transactions", "dedup_hash"):
            op.add_column("transactions", sa.Column("dedup_hash", sa.String(64), nullable=True))

        _safe_create_index("ix_transactions_account_id", "transactions", ["account_id"])
        _safe_create_index(
            "ix_transactions_transfer_to_account_id",
            "transactions",
            ["transfer_to_account_id"],
        )
        _safe_create_index("ix_transactions_import_batch_id", "transactions", ["import_batch_id"])
        _safe_create_index("ix_transactions_dedup_hash", "transactions", ["dedup_hash"])


def downgrade() -> None:
    if _has_table("transactions"):
        inspector = sa.inspect(op.get_bind())
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("transactions")}
        for idx in [
            "ix_transactions_dedup_hash",
            "ix_transactions_import_batch_id",
            "ix_transactions_transfer_to_account_id",
            "ix_transactions_account_id",
        ]:
            if idx in existing_indexes:
                op.drop_index(idx, table_name="transactions")

        if _has_column("transactions", "dedup_hash"):
            op.drop_column("transactions", "dedup_hash")
        if _has_column("transactions", "import_batch_id"):
            op.drop_column("transactions", "import_batch_id")
        if _has_column("transactions", "transfer_to_account_id"):
            op.drop_column("transactions", "transfer_to_account_id")
        if _has_column("transactions", "account_id"):
            op.drop_column("transactions", "account_id")

    if _has_table("insights"):
        op.drop_index("ix_insights_user_type", table_name="insights")
        op.drop_index("ix_insights_user_id", table_name="insights")
        op.drop_table("insights")

    if _has_table("import_batches"):
        op.drop_index("ix_import_batches_user_id", table_name="import_batches")
        op.drop_table("import_batches")

    if _has_table("balance_snapshots"):
        op.drop_index("ix_balance_snapshots_account_date", table_name="balance_snapshots")
        op.drop_index("ix_balance_snapshots_user_id", table_name="balance_snapshots")
        op.drop_index("ix_balance_snapshots_account_id", table_name="balance_snapshots")
        op.drop_table("balance_snapshots")

    if _has_table("accounts"):
        op.drop_index("ix_accounts_user_name", table_name="accounts")
        op.drop_index("ix_accounts_user_id", table_name="accounts")
        op.drop_table("accounts")
