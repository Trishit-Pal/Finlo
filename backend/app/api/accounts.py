"""Accounts API: CRUD, balance snapshots, net worth calculation."""

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.exceptions import ResourceNotFound
from app.db.models import Account, BalanceSnapshot
from app.dependencies import DB, CurrentUser
from app.services.audit import log_audit_event

VALID_ACCOUNT_TYPES = {"bank", "cash", "wallet", "credit_card", "loan"}

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., description="bank/cash/wallet/credit_card/loan")
    institution_label: Optional[str] = Field(None, max_length=128)
    last4: Optional[str] = Field(None, max_length=4)
    opening_balance: float = Field(0.0, ge=-100_000_000, le=100_000_000)
    currency: str = Field("INR", max_length=8)

    def model_post_init(self, __context: Any) -> None:
        if self.type not in VALID_ACCOUNT_TYPES:
            raise ValueError(
                f"type must be one of: {', '.join(sorted(VALID_ACCOUNT_TYPES))}"
            )


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    institution_label: Optional[str] = Field(None, max_length=128)
    last4: Optional[str] = Field(None, max_length=4)
    current_balance: Optional[float] = Field(None, ge=-100_000_000, le=100_000_000)
    is_active: Optional[bool] = None


class AccountOut(BaseModel):
    id: str
    name: str
    type: str
    institution_label: Optional[str]
    last4: Optional[str]
    opening_balance: float
    current_balance: float
    currency: str
    is_active: bool
    created_at: Any

    class Config:
        from_attributes = True


class SnapshotCreate(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    balance: float = Field(..., ge=-100_000_000, le=100_000_000)
    notes: Optional[str] = Field(None, max_length=500)


class SnapshotOut(BaseModel):
    id: str
    account_id: str
    date: str
    balance: float
    notes: Optional[str]
    created_at: Any

    class Config:
        from_attributes = True


class NetWorthOut(BaseModel):
    total_assets: float
    total_liabilities: float
    net_worth: float
    accounts: list[AccountOut]


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(
    body: AccountCreate, request: Request, current_user: CurrentUser, db: DB
) -> AccountOut:
    # Check for duplicate name
    existing = await db.execute(
        select(Account).where(
            Account.user_id == current_user.id,
            Account.name == body.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Account '{body.name}' already exists",
        )

    account = Account(
        user_id=current_user.id,
        name=body.name,
        type=body.type,
        institution_label=body.institution_label,
        last4=body.last4,
        opening_balance=body.opening_balance,
        current_balance=body.opening_balance,
        currency=body.currency,
    )
    db.add(account)
    await db.flush()
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="account.created",
        resource_type="account",
        resource_id=account.id,
        metadata={"type": account.type, "name": account.name},
        request=request,
    )
    return AccountOut.model_validate(account)


@router.get("")
async def list_accounts(
    current_user: CurrentUser,
    db: DB,
    active_only: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    q = select(Account).where(Account.user_id == current_user.id)
    if active_only:
        q = q.where(Account.is_active.is_(True))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    q = q.order_by(Account.created_at).limit(limit).offset(offset)
    result = await db.execute(q)
    return {
        "items": [AccountOut.model_validate(a) for a in result.scalars().all()],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: str,
    body: AccountUpdate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> AccountOut:
    result = await db.execute(
        select(Account).where(
            Account.id == account_id, Account.user_id == current_user.id
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise ResourceNotFound("Account")

    for field in body.model_fields_set:
        setattr(account, field, getattr(body, field))
    await db.flush()
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="account.updated",
        resource_type="account",
        resource_id=account.id,
        metadata={"fields": list(body.model_fields_set)},
        request=request,
    )
    return AccountOut.model_validate(account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: str, request: Request, current_user: CurrentUser, db: DB
) -> None:
    result = await db.execute(
        select(Account).where(
            Account.id == account_id, Account.user_id == current_user.id
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise ResourceNotFound("Account")
    await db.delete(account)
    await log_audit_event(
        db,
        user_id=current_user.id,
        action="account.deleted",
        resource_type="account",
        resource_id=account_id,
        metadata={"name": account.name},
        request=request,
    )


# ── Balance Snapshots ─────────────────────────────────────────────────────────


@router.post(
    "/{account_id}/snapshots",
    response_model=SnapshotOut,
    status_code=status.HTTP_201_CREATED,
)
async def record_snapshot(
    account_id: str,
    body: SnapshotCreate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
) -> SnapshotOut:
    result = await db.execute(
        select(Account).where(
            Account.id == account_id, Account.user_id == current_user.id
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise ResourceNotFound("Account")

    snapshot = BalanceSnapshot(
        account_id=account_id,
        user_id=current_user.id,
        date=body.date,
        balance=body.balance,
        notes=body.notes,
    )
    db.add(snapshot)
    # Also update the account's current_balance
    account.current_balance = body.balance
    await db.flush()
    return SnapshotOut.model_validate(snapshot)


@router.get("/{account_id}/snapshots", response_model=list[SnapshotOut])
async def list_snapshots(
    account_id: str,
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(30, le=100),
) -> list[SnapshotOut]:
    result = await db.execute(
        select(BalanceSnapshot)
        .where(
            BalanceSnapshot.account_id == account_id,
            BalanceSnapshot.user_id == current_user.id,
        )
        .order_by(BalanceSnapshot.date.desc())
        .limit(limit)
    )
    return [SnapshotOut.model_validate(s) for s in result.scalars().all()]


# ── Net Worth ─────────────────────────────────────────────────────────────────


@router.get("/net-worth", response_model=NetWorthOut)
async def get_net_worth(current_user: CurrentUser, db: DB) -> NetWorthOut:
    result = await db.execute(
        select(Account).where(
            Account.user_id == current_user.id, Account.is_active.is_(True)
        )
    )
    accounts = result.scalars().all()

    total_assets = 0.0
    total_liabilities = 0.0
    for a in accounts:
        if a.type in ("bank", "cash", "wallet"):
            total_assets += a.current_balance
        elif a.type == "credit_card":
            total_liabilities += abs(a.current_balance)
        elif a.type == "loan":
            total_liabilities += abs(a.current_balance)

    return NetWorthOut(
        total_assets=round(total_assets, 2),
        total_liabilities=round(total_liabilities, 2),
        net_worth=round(total_assets - total_liabilities, 2),
        accounts=[AccountOut.model_validate(a) for a in accounts],
    )
