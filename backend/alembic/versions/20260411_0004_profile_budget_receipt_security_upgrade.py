"""profile/budget/receipt security upgrade

Revision ID: 20260411_0004
Revises: 20260408_0003
Create Date: 2026-04-11
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260411_0004"
down_revision = "20260408_0003"
branch_labels = None
depends_on = None


def _create_immutable_profile_triggers() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE OR REPLACE FUNCTION finlo_enforce_immutable_profile_fields()
            RETURNS trigger AS $$
            BEGIN
              IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
                RAISE EXCEPTION 'username is immutable once set';
              END IF;
              IF OLD.date_of_birth IS NOT NULL AND NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
                RAISE EXCEPTION 'date_of_birth is immutable once set';
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS trg_users_immutable_profile ON users;
            CREATE TRIGGER trg_users_immutable_profile
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION finlo_enforce_immutable_profile_fields();
            """
        )
    else:
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_users_username_immutable
            BEFORE UPDATE ON users
            FOR EACH ROW
            WHEN OLD.username IS NOT NULL AND COALESCE(NEW.username, '') <> COALESCE(OLD.username, '')
            BEGIN
              SELECT RAISE(ABORT, 'username is immutable once set');
            END;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_users_dob_immutable
            BEFORE UPDATE ON users
            FOR EACH ROW
            WHEN OLD.date_of_birth IS NOT NULL AND COALESCE(NEW.date_of_birth, '') <> COALESCE(OLD.date_of_birth, '')
            BEGIN
              SELECT RAISE(ABORT, 'date_of_birth is immutable once set');
            END;
            """
        )


def _drop_immutable_profile_triggers() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_users_immutable_profile ON users;")
        op.execute("DROP FUNCTION IF EXISTS finlo_enforce_immutable_profile_fields();")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_users_username_immutable;")
        op.execute("DROP TRIGGER IF EXISTS trg_users_dob_immutable;")


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    user_columns = {c["name"] for c in inspector.get_columns("users")}
    receipt_columns = {c["name"] for c in inspector.get_columns("receipts")}
    budget_columns = {c["name"] for c in inspector.get_columns("budgets")}

    # Fresh DBs created from current metadata may already include these objects.
    if (
        {"budget_versions", "user_consents", "audit_logs"} <= tables
        and {"username", "username_source", "date_of_birth_source"} <= user_columns
        and {
            "source_hash",
            "duplicate_of_receipt_id",
            "duplicate_confidence",
            "due_date",
            "category_suggestion",
            "recurring_indicator",
            "account_suffix",
            "parser_provider",
        }
        <= receipt_columns
        and {"edit_count", "version", "last_edited_at"} <= budget_columns
    ):
        _create_immutable_profile_triggers()
        return

    # users
    op.add_column("users", sa.Column("username", sa.String(length=64), nullable=True))
    op.add_column(
        "users", sa.Column("username_source", sa.String(length=16), nullable=True)
    )
    op.add_column(
        "users", sa.Column("date_of_birth_source", sa.String(length=16), nullable=True)
    )
    op.create_index("ix_users_username", "users", ["username"], unique=False)

    # receipts
    op.add_column(
        "receipts", sa.Column("source_hash", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "receipts",
        sa.Column("duplicate_of_receipt_id", sa.String(length=36), nullable=True),
    )
    op.add_column(
        "receipts", sa.Column("duplicate_confidence", sa.Float(), nullable=True)
    )
    op.add_column(
        "receipts", sa.Column("due_date", sa.String(length=32), nullable=True)
    )
    op.add_column(
        "receipts",
        sa.Column("category_suggestion", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "receipts",
        sa.Column(
            "recurring_indicator",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "receipts", sa.Column("account_suffix", sa.String(length=8), nullable=True)
    )
    op.add_column(
        "receipts", sa.Column("parser_provider", sa.String(length=64), nullable=True)
    )
    op.create_foreign_key(
        "fk_receipts_duplicate_of_receipt_id",
        "receipts",
        "receipts",
        ["duplicate_of_receipt_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_receipts_source_hash", "receipts", ["source_hash"], unique=False
    )

    # budgets
    op.add_column(
        "budgets",
        sa.Column(
            "edit_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.add_column(
        "budgets",
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column(
        "budgets",
        sa.Column("last_edited_at", sa.DateTime(timezone=True), nullable=True),
    )

    # budget versions
    op.create_table(
        "budget_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("budget_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column(
            "change_reason",
            sa.String(length=32),
            nullable=False,
            server_default="update",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["budget_id"], ["budgets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_budget_versions_budget_id", "budget_versions", ["budget_id"], unique=False
    )
    op.create_index(
        "ix_budget_versions_user_id", "budget_versions", ["user_id"], unique=False
    )
    op.create_index(
        "ix_budget_versions_budget_version",
        "budget_versions",
        ["budget_id", "version"],
        unique=True,
    )

    # user consents
    op.create_table(
        "user_consents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("consent_type", sa.String(length=64), nullable=False),
        sa.Column(
            "scope",
            sa.String(length=128),
            nullable=False,
            server_default="transactions",
        ),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="granted"
        ),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_consents_user_id", "user_consents", ["user_id"], unique=False
    )
    op.create_index(
        "ix_user_consents_unique_scope",
        "user_consents",
        ["user_id", "consent_type", "scope"],
        unique=True,
    )

    # audit logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)
    op.create_index(
        "ix_audit_logs_created_at", "audit_logs", ["created_at"], unique=False
    )
    op.create_index(
        "ix_audit_logs_action_created",
        "audit_logs",
        ["action", "created_at"],
        unique=False,
    )

    _create_immutable_profile_triggers()


def downgrade() -> None:
    _drop_immutable_profile_triggers()

    op.drop_index("ix_audit_logs_action_created", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_user_consents_unique_scope", table_name="user_consents")
    op.drop_index("ix_user_consents_user_id", table_name="user_consents")
    op.drop_table("user_consents")

    op.drop_index("ix_budget_versions_budget_version", table_name="budget_versions")
    op.drop_index("ix_budget_versions_user_id", table_name="budget_versions")
    op.drop_index("ix_budget_versions_budget_id", table_name="budget_versions")
    op.drop_table("budget_versions")

    op.drop_column("budgets", "last_edited_at")
    op.drop_column("budgets", "version")
    op.drop_column("budgets", "edit_count")

    op.drop_index("ix_receipts_source_hash", table_name="receipts")
    op.drop_constraint(
        "fk_receipts_duplicate_of_receipt_id", "receipts", type_="foreignkey"
    )
    op.drop_column("receipts", "parser_provider")
    op.drop_column("receipts", "account_suffix")
    op.drop_column("receipts", "recurring_indicator")
    op.drop_column("receipts", "category_suggestion")
    op.drop_column("receipts", "due_date")
    op.drop_column("receipts", "duplicate_confidence")
    op.drop_column("receipts", "duplicate_of_receipt_id")
    op.drop_column("receipts", "source_hash")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "date_of_birth_source")
    op.drop_column("users", "username_source")
    op.drop_column("users", "username")
