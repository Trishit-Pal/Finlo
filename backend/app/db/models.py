"""SQLAlchemy ORM models — Finlo Expense Tracker."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, declarative_base, mapped_column, relationship

Base = declarative_base()


def gen_uuid() -> str:
    return str(uuid.uuid4())


# ── Auth & Tokens ────────────────────────────────────────────────────────────


class OTPToken(Base):
    __tablename__ = "otp_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    mobile_number: Mapped[str] = mapped_column(String(64), nullable=False)
    mobile_number_hash: Mapped[str] = mapped_column(
        String(128), index=True, nullable=False
    )
    otp_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class RefreshToken(Base):
    """Server-side record of issued refresh tokens for rotation + theft detection."""

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # Family groups rotated tokens so a replay of any old jti revokes the
    # entire chain (token-theft response).
    family_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rotated_to_jti: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class LoginAttempt(Base):
    """Failed-signin log for brute-force lockout (per-email hash)."""

    __tablename__ = "login_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class Notification(Base):
    """User-facing notification (bill reminders, alerts, system messages)."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # bill_due/budget_alert/system
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        Index(
            "ix_notifications_user_dedup",
            "user_id",
            "type",
            "resource_id",
        ),
    )


# ── Users ────────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    oauth_sub: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    username_source: Mapped[Optional[str]] = mapped_column(
        String(16), nullable=True
    )  # manual/google/migration/admin
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    date_of_birth: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    date_of_birth_source: Mapped[Optional[str]] = mapped_column(
        String(16), nullable=True
    )  # manual/google/migration/admin
    city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    mobile_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    mobile_number_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    monthly_income: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # encrypted
    monthly_budget_inr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    settings: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    receipts: Mapped[list["Receipt"]] = relationship(
        "Receipt", back_populates="user", cascade="all, delete-orphan"
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction",
        back_populates="user",
        foreign_keys="[Transaction.user_id]",
        cascade="all, delete-orphan",
    )
    categories: Mapped[list["Category"]] = relationship(
        "Category", back_populates="user", cascade="all, delete-orphan"
    )
    budgets: Mapped[list["Budget"]] = relationship(
        "Budget", back_populates="user", cascade="all, delete-orphan"
    )
    bills: Mapped[list["Bill"]] = relationship(
        "Bill", back_populates="user", cascade="all, delete-orphan"
    )
    debts: Mapped[list["Debt"]] = relationship(
        "Debt", back_populates="user", cascade="all, delete-orphan"
    )
    savings_goals: Mapped[list["SavingsGoal"]] = relationship(
        "SavingsGoal", back_populates="user", cascade="all, delete-orphan"
    )
    suggestions: Mapped[list["Suggestion"]] = relationship(
        "Suggestion", back_populates="user", cascade="all, delete-orphan"
    )
    feedbacks: Mapped[list["Feedback"]] = relationship(
        "Feedback", back_populates="user", cascade="all, delete-orphan"
    )
    budget_versions: Mapped[list["BudgetVersion"]] = relationship(
        "BudgetVersion", back_populates="user", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="user"
    )
    consents: Mapped[list["UserConsent"]] = relationship(
        "UserConsent", back_populates="user", cascade="all, delete-orphan"
    )
    accounts: Mapped[list["Account"]] = relationship(
        "Account", back_populates="user", cascade="all, delete-orphan"
    )
    import_batches: Mapped[list["ImportBatch"]] = relationship(
        "ImportBatch", back_populates="user", cascade="all, delete-orphan"
    )
    recurring_rules: Mapped[list["RecurringRule"]] = relationship(
        "RecurringRule", back_populates="user", cascade="all, delete-orphan"
    )
    insights: Mapped[list["Insight"]] = relationship(
        "Insight", back_populates="user", cascade="all, delete-orphan"
    )


# ── Categories ───────────────────────────────────────────────────────────────


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="categories")

    __table_args__ = (Index("ix_categories_user_name", "user_id", "name", unique=True),)


# ── Receipts ──────────────────────────────────────────────────────────────────


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    merchant: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    total: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tax: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    items: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    ocr_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    raw_image_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    source_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    duplicate_of_receipt_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("receipts.id", ondelete="SET NULL"), nullable=True
    )
    duplicate_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    due_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    category_suggestion: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True
    )
    recurring_indicator: Mapped[bool] = mapped_column(Boolean, default=False)
    account_suffix: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    parser_provider: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="upload")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    raw_ocr_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    field_confidence: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="receipts")
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="receipt"
    )


# ── Transactions ─────────────────────────────────────────────────────────────


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[str] = mapped_column(String(32), nullable=False)
    merchant: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    type: Mapped[str] = mapped_column(
        String(16), default="expense"
    )  # income/expense/transfer
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    category_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    category_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    payment_mode: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )  # cash/upi/card/net_banking
    tags: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    recurrence_frequency: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )  # daily/weekly/monthly/yearly
    source: Mapped[str] = mapped_column(String(32), default="manual")
    receipt_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("receipts.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    transfer_to_account_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    transfer_direction: Mapped[Optional[str]] = mapped_column(
        String(8), nullable=True
    )  # debit/credit — describes direction on source account
    import_batch_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True
    )
    dedup_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(
        "User", back_populates="transactions", foreign_keys=[user_id]
    )
    receipt: Mapped[Optional["Receipt"]] = relationship(
        "Receipt", back_populates="transactions"
    )
    account: Mapped[Optional["Account"]] = relationship(
        "Account", foreign_keys=[account_id], back_populates="transactions"
    )
    transfer_to_account: Mapped[Optional["Account"]] = relationship(
        "Account", foreign_keys=[transfer_to_account_id]
    )
    import_batch: Mapped[Optional["ImportBatch"]] = relationship(
        "ImportBatch", back_populates="transactions"
    )

    __table_args__ = (
        Index("ix_transactions_user_date", "user_id", "date"),
        Index("ix_transactions_dedup", "user_id", "dedup_hash"),
        # At most one transaction per receipt — prevents concurrent
        # /receipts/confirm calls from duplicating the charge.
        Index(
            "ux_transactions_receipt_id",
            "receipt_id",
            unique=True,
            sqlite_where=text("receipt_id IS NOT NULL"),
            postgresql_where=text("receipt_id IS NOT NULL"),
        ),
    )


# ── Bills & Reminders ───────────────────────────────────────────────────────


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    is_variable: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[str] = mapped_column(String(32), nullable=False)
    frequency: Mapped[str] = mapped_column(
        String(32), default="monthly"
    )  # once/weekly/monthly/quarterly/yearly
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    category_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    reminder_lead_days: Mapped[int] = mapped_column(Integer, default=3)  # 1/3/7
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_create_expense: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="bills")


# ── Budgets ──────────────────────────────────────────────────────────────────


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(
        String(128), nullable=False
    )  # "overall" for total
    category_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    limit_amount: Mapped[float] = mapped_column(Float, nullable=False)
    is_percentage: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # limit as % of income
    rollover_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    soft_alert: Mapped[float] = mapped_column(Float, default=0.8)
    hard_alert: Mapped[float] = mapped_column(Float, default=1.0)
    edit_count: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    last_edited_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="budgets")

    __table_args__ = (Index("ix_budgets_user_month_year", "user_id", "month", "year"),)


# ── Debts & Loans ───────────────────────────────────────────────────────────


class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # personal_loan/credit_card/owed_to/owed_by
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    remaining_balance: Mapped[float] = mapped_column(Float, nullable=False)
    interest_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    emi_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    next_due_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    lender_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_settled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="debts")


# ── Savings Goals ────────────────────────────────────────────────────────────


class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_amount: Mapped[float] = mapped_column(Float, nullable=False)
    current_amount: Mapped[float] = mapped_column(Float, default=0.0)
    deadline: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # Optional account link: when set, current_amount tracks the account balance
    linked_account_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="savings_goals")


# ── Suggestions (Coach) ──────────────────────────────────────────────────────


class Suggestion(Base):
    __tablename__ = "suggestions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receipt_ids: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    categories: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actions: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    estimated_savings: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    user_edit: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    responded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship("User", back_populates="suggestions")


# ── Feedback ─────────────────────────────────────────────────────────────────


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    screen: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    feature_request: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_bug_report: Mapped[bool] = mapped_column(Boolean, default=False)
    classification: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    top_improvements: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    priority: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    upvotes: Mapped[int] = mapped_column(Integer, default=0)
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="feedbacks")


class BudgetVersion(Base):
    __tablename__ = "budget_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    budget_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("budgets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    change_reason: Mapped[str] = mapped_column(
        String(32), nullable=False, default="update"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="budget_versions")

    __table_args__ = (
        Index("ix_budget_versions_budget_version", "budget_id", "version", unique=True),
    )


class UserConsent(Base):
    __tablename__ = "user_consents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    consent_type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # statement_import/aggregator_link/email_parse/sms_parse
    scope: Mapped[str] = mapped_column(
        String(128), nullable=False, default="transactions"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="granted"
    )  # granted/revoked
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict)
    granted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="consents")

    __table_args__ = (
        Index(
            "ix_user_consents_unique_scope",
            "user_id",
            "consent_type",
            "scope",
            unique=True,
        ),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user: Mapped[Optional["User"]] = relationship("User", back_populates="audit_logs")

    __table_args__ = (Index("ix_audit_logs_action_created", "action", "created_at"),)


# ── Accounts ─────────────────────────────────────────────────────────────────


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # bank/cash/wallet/credit_card/loan
    institution_label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    last4: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    opening_balance: Mapped[float] = mapped_column(Float, default=0.0)
    current_balance: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", foreign_keys="[Transaction.account_id]", back_populates="account"
    )
    balance_snapshots: Mapped[list["BalanceSnapshot"]] = relationship(
        "BalanceSnapshot", back_populates="account", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_accounts_user_name", "user_id", "name", unique=True),)


# ── Balance Snapshots ────────────────────────────────────────────────────────


class BalanceSnapshot(Base):
    __tablename__ = "balance_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    account_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[str] = mapped_column(String(32), nullable=False)
    balance: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    account: Mapped["Account"] = relationship(
        "Account", back_populates="balance_snapshots"
    )

    __table_args__ = (Index("ix_balance_snapshots_account_date", "account_id", "date"),)


# ── Import Batches ───────────────────────────────────────────────────────────


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_type: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # csv/pasted_text/statement
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    column_mapping: Mapped[Optional[dict]] = mapped_column(
        JSON, default=dict
    )  # {csv_col: internal_field}
    errors_detail: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(
        String(16), default="completed"
    )  # completed/partial/failed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="import_batches")
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="import_batch"
    )


# ── Recurring Rules ──────────────────────────────────────────────────────────


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(16), default="expense")  # income/expense
    frequency: Mapped[str] = mapped_column(
        String(32), default="monthly"
    )  # weekly/monthly/quarterly/yearly
    expected_amount: Mapped[float] = mapped_column(Float, nullable=False)
    next_due_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    merchant_pattern: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    account_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="recurring_rules")


# ── Insights ─────────────────────────────────────────────────────────────────


class Insight(Base):
    __tablename__ = "insights"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # spending_spike/budget_risk/savings_opportunity/recurring_obligation/anomaly/data_quality/positive_progress
    severity: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # info/warning/critical/positive
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metric_basis: Mapped[Optional[dict]] = mapped_column(
        JSON, default=dict
    )  # raw numbers backing the insight
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="insights")

    __table_args__ = (Index("ix_insights_user_type", "user_id", "type"),)


# ── Embeddings (pgvector) ────────────────────────────────────────────────────


class Embedding(Base):
    __tablename__ = "embeddings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    parent_id: Mapped[str] = mapped_column(String(36), nullable=False)
    vector: Mapped[list[float]] = mapped_column(JSON, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (Index("ix_embeddings_parent_type", "parent_id", "type"),)
