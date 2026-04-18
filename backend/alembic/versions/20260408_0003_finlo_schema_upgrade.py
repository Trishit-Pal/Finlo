"""Finlo schema upgrade: categories, debts, savings_goals, overhauled bills, updated users/transactions

Revision ID: 20260408_0003
Revises: 20260408_0002
Create Date: 2026-04-08
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260408_0003"
down_revision = "20260408_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    user_columns = {c["name"] for c in inspector.get_columns("users")}
    tx_columns = {c["name"] for c in inspector.get_columns("transactions")}
    bills_columns = {c["name"] for c in inspector.get_columns("bills")}
    budgets_columns = {c["name"] for c in inspector.get_columns("budgets")}
    feedback_columns = {c["name"] for c in inspector.get_columns("feedback")}

    # Fresh DBs created by 20260407_0001 may already include this shape.
    if (
        {"categories", "debts", "savings_goals"} <= tables
        and {"city", "currency", "monthly_income"} <= user_columns
        and {"category_id", "payment_mode", "tags", "is_recurring", "recurrence_frequency"} <= tx_columns
        and {"is_variable", "frequency", "reminder_lead_days", "auto_create_expense"} <= bills_columns
        and {"category_id", "is_percentage", "rollover_enabled"} <= budgets_columns
        and {"screen", "is_bug_report", "upvotes"} <= feedback_columns
    ):
        return

    # ── Categories table ─────────────────────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("icon", sa.String(32), nullable=True),
        sa.Column("color", sa.String(16), nullable=True),
        sa.Column("is_archived", sa.Boolean, default=False),
        sa.Column("is_default", sa.Boolean, default=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_categories_user_name", "categories", ["user_id", "name"], unique=True
    )

    # ── Debts table ──────────────────────────────────────────────────────────
    op.create_table(
        "debts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("total_amount", sa.Float, nullable=False),
        sa.Column("remaining_balance", sa.Float, nullable=False),
        sa.Column("interest_rate", sa.Float, nullable=True),
        sa.Column("emi_amount", sa.Float, nullable=True),
        sa.Column("next_due_date", sa.String(32), nullable=True),
        sa.Column("lender_name", sa.String(255), nullable=True),
        sa.Column("is_settled", sa.Boolean, default=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    # ── Savings Goals table ──────────────────────────────────────────────────
    op.create_table(
        "savings_goals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("target_amount", sa.Float, nullable=False),
        sa.Column("current_amount", sa.Float, default=0.0),
        sa.Column("deadline", sa.String(32), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    # ── Users: add new columns ───────────────────────────────────────────────
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("city", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("currency", sa.String(8), server_default="INR"))
        batch_op.add_column(sa.Column("monthly_income", sa.Text, nullable=True))

    # ── Transactions: add new columns ────────────────────────────────────────
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(sa.Column("category_id", sa.String(36), nullable=True))
        batch_op.add_column(sa.Column("payment_mode", sa.String(32), nullable=True))
        batch_op.add_column(sa.Column("tags", sa.JSON, nullable=True))
        batch_op.add_column(sa.Column("is_recurring", sa.Boolean, server_default="0"))
        batch_op.add_column(
            sa.Column("recurrence_frequency", sa.String(32), nullable=True)
        )

    # ── Bills: recreate with new schema (SQLite doesn't support full ALTER) ──
    # Rename old bills table, create new one, migrate data
    op.rename_table("bills", "bills_old")

    op.create_table(
        "bills",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("is_variable", sa.Boolean, default=False),
        sa.Column("due_date", sa.String(32), nullable=False),
        sa.Column("frequency", sa.String(32), server_default="monthly"),
        sa.Column("category", sa.String(128), nullable=True),
        sa.Column("category_id", sa.String(36), nullable=True),
        sa.Column("reminder_lead_days", sa.Integer, server_default="3"),
        sa.Column("is_paid", sa.Boolean, default=False),
        sa.Column("auto_create_expense", sa.Boolean, default=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    # Migrate old bill data — map place→name, date→due_date
    op.execute(
        "INSERT INTO bills (id, user_id, name, amount, due_date, category, description, created_at) "
        "SELECT id, user_id, place, amount, date, category, description, created_at FROM bills_old"
    )
    op.drop_table("bills_old")

    # ── Budgets: add new columns ─────────────────────────────────────────────
    with op.batch_alter_table("budgets") as batch_op:
        batch_op.add_column(sa.Column("category_id", sa.String(36), nullable=True))
        batch_op.add_column(sa.Column("is_percentage", sa.Boolean, server_default="0"))
        batch_op.add_column(
            sa.Column("rollover_enabled", sa.Boolean, server_default="0")
        )

    # ── Feedback: add new columns ────────────────────────────────────────────
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.add_column(sa.Column("screen", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("is_bug_report", sa.Boolean, server_default="0"))
        batch_op.add_column(sa.Column("upvotes", sa.Integer, server_default="0"))


def downgrade() -> None:
    # Feedback
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.drop_column("upvotes")
        batch_op.drop_column("is_bug_report")
        batch_op.drop_column("screen")

    # Budgets
    with op.batch_alter_table("budgets") as batch_op:
        batch_op.drop_column("rollover_enabled")
        batch_op.drop_column("is_percentage")
        batch_op.drop_column("category_id")

    # Bills: recreate old schema
    op.rename_table("bills", "bills_new")
    op.create_table(
        "bills",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("date", sa.String(32), nullable=False),
        sa.Column("category", sa.String(128), nullable=True),
        sa.Column("place", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.execute(
        "INSERT INTO bills (id, user_id, amount, date, category, place, description, created_at) "
        "SELECT id, user_id, amount, due_date, category, name, description, created_at FROM bills_new"
    )
    op.drop_table("bills_new")

    # Transactions
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_column("recurrence_frequency")
        batch_op.drop_column("is_recurring")
        batch_op.drop_column("tags")
        batch_op.drop_column("payment_mode")
        batch_op.drop_column("category_id")

    # Users
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("monthly_income")
        batch_op.drop_column("currency")
        batch_op.drop_column("city")

    op.drop_table("savings_goals")
    op.drop_table("debts")
    op.drop_index("ix_categories_user_name", table_name="categories")
    op.drop_table("categories")
