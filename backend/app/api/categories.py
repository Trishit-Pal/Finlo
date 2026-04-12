"""Categories API: user-defined expense categories."""
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select

from app.api.exceptions import ResourceNotFound
from app.db.models import Category, Transaction
from app.dependencies import DB, CurrentUser

router = APIRouter()

DEFAULT_CATEGORIES = [
    {"name": "Food & Dining", "icon": "utensils", "color": "#f97316"},
    {"name": "Transport", "icon": "car", "color": "#3b82f6"},
    {"name": "Groceries", "icon": "shopping-cart", "color": "#f59e0b"},
    {"name": "Shopping", "icon": "shopping-bag", "color": "#ec4899"},
    {"name": "Health", "icon": "heart-pulse", "color": "#ef4444"},
    {"name": "Utilities", "icon": "zap", "color": "#eab308"},
    {"name": "Entertainment", "icon": "gamepad-2", "color": "#8b5cf6"},
    {"name": "Education", "icon": "graduation-cap", "color": "#06b6d4"},
    {"name": "Travel", "icon": "plane", "color": "#14b8a6"},
    {"name": "EMI/Loan", "icon": "landmark", "color": "#6366f1"},
    {"name": "Rent", "icon": "home", "color": "#a855f7"},
    {"name": "Savings", "icon": "piggy-bank", "color": "#22c55e"},
    {"name": "Miscellaneous", "icon": "more-horizontal", "color": "#6b7280"},
]


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    is_archived: Optional[bool] = None


class CategoryOut(BaseModel):
    id: str
    name: str
    icon: Optional[str]
    color: Optional[str]
    is_archived: bool
    is_default: bool

    class Config:
        from_attributes = True


@router.post("/init", response_model=list[CategoryOut])
async def init_default_categories(current_user: CurrentUser, db: DB) -> list[CategoryOut]:
    """Create default categories for user if none exist."""
    result = await db.execute(
        select(sa_func.count()).select_from(Category).where(Category.user_id == current_user.id)
    )
    count = result.scalar()
    if count and count > 0:
        result = await db.execute(
            select(Category).where(Category.user_id == current_user.id).order_by(Category.name)
        )
        return [CategoryOut.model_validate(c) for c in result.scalars().all()]

    cats = []
    for dc in DEFAULT_CATEGORIES:
        cat = Category(
            user_id=current_user.id,
            name=dc["name"],
            icon=dc["icon"],
            color=dc["color"],
            is_default=True,
        )
        db.add(cat)
        cats.append(cat)
    await db.flush()
    return [CategoryOut.model_validate(c) for c in cats]


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    current_user: CurrentUser, db: DB, include_archived: bool = False
) -> list[CategoryOut]:
    q = select(Category).where(Category.user_id == current_user.id)
    if not include_archived:
        q = q.where(Category.is_archived.is_(False))
    q = q.order_by(Category.name)
    result = await db.execute(q)
    return [CategoryOut.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, current_user: CurrentUser, db: DB) -> CategoryOut:
    cat = Category(
        user_id=current_user.id,
        name=body.name,
        icon=body.icon,
        color=body.color,
    )
    db.add(cat)
    await db.flush()
    return CategoryOut.model_validate(cat)


@router.patch("/{cat_id}", response_model=CategoryOut)
async def update_category(
    cat_id: str, body: CategoryUpdate, current_user: CurrentUser, db: DB
) -> CategoryOut:
    result = await db.execute(
        select(Category).where(Category.id == cat_id, Category.user_id == current_user.id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise ResourceNotFound("Category")
    if body.name is not None:
        cat.name = body.name
    if body.icon is not None:
        cat.icon = body.icon
    if body.color is not None:
        cat.color = body.color
    if body.is_archived is not None:
        cat.is_archived = body.is_archived
    await db.flush()
    return CategoryOut.model_validate(cat)


@router.delete("/{cat_id}")
async def delete_category(cat_id: str, current_user: CurrentUser, db: DB) -> dict:
    result = await db.execute(
        select(Category).where(Category.id == cat_id, Category.user_id == current_user.id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise ResourceNotFound("Category")

    # Check if linked to transactions — archive instead of delete
    tx_count = await db.execute(
        select(sa_func.count()).select_from(Transaction).where(Transaction.category_id == cat_id)
    )
    if tx_count.scalar() > 0:
        cat.is_archived = True
        await db.flush()
        return {"detail": "Category archived (linked to existing entries)"}

    await db.delete(cat)
    return {"detail": "Category deleted"}
