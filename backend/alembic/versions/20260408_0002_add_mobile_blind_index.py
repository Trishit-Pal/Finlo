"""add mobile_number_hash blind index column

Revision ID: 20260408_0002
Revises: 20260407_0001
Create Date: 2026-04-08
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260408_0002"
down_revision = "20260407_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "mobile_number_hash" not in columns:
        op.add_column(
            "users", sa.Column("mobile_number_hash", sa.String(64), nullable=True)
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if "ix_users_mobile_number_hash" not in existing_indexes:
        op.create_index("ix_users_mobile_number_hash", "users", ["mobile_number_hash"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if "ix_users_mobile_number_hash" in existing_indexes:
        op.drop_index("ix_users_mobile_number_hash", table_name="users")
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "mobile_number_hash" in columns:
        op.drop_column("users", "mobile_number_hash")
