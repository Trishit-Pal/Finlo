"""Savings Goals API: track savings targets and progress."""
from typing import Optional

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.exceptions import ResourceNotFound
from app.db.models import SavingsGoal
from app.dependencies import DB, CurrentUser

router = APIRouter()


class GoalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    target_amount: float = Field(..., gt=0, le=100_000_000)
    current_amount: float = Field(0.0, ge=0)
    deadline: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    deadline: Optional[str] = None


class GoalOut(BaseModel):
    id: str
    name: str
    target_amount: float
    current_amount: float
    deadline: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class ContributeBody(BaseModel):
    amount: float = Field(..., gt=0, le=100_000_000)


@router.get("", response_model=list[GoalOut])
async def list_goals(current_user: CurrentUser, db: DB) -> list[GoalOut]:
    result = await db.execute(
        select(SavingsGoal)
        .where(SavingsGoal.user_id == current_user.id)
        .order_by(SavingsGoal.created_at.desc())
    )
    return [GoalOut.model_validate(g) for g in result.scalars().all()]


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
async def create_goal(body: GoalCreate, current_user: CurrentUser, db: DB) -> GoalOut:
    goal = SavingsGoal(
        user_id=current_user.id,
        name=body.name,
        target_amount=body.target_amount,
        current_amount=body.current_amount,
        deadline=body.deadline,
    )
    db.add(goal)
    await db.flush()
    return GoalOut.model_validate(goal)


@router.patch("/{goal_id}", response_model=GoalOut)
async def update_goal(
    goal_id: str, body: GoalUpdate, current_user: CurrentUser, db: DB
) -> GoalOut:
    result = await db.execute(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id
        )
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise ResourceNotFound("Savings goal")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    await db.flush()
    return GoalOut.model_validate(goal)


@router.post("/{goal_id}/contribute", response_model=GoalOut)
async def contribute(
    goal_id: str, body: ContributeBody, current_user: CurrentUser, db: DB
) -> GoalOut:
    """Add a contribution to a savings goal."""
    result = await db.execute(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id
        )
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise ResourceNotFound("Savings goal")
    goal.current_amount = min(goal.target_amount, goal.current_amount + body.amount)
    await db.flush()
    return GoalOut.model_validate(goal)


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, current_user: CurrentUser, db: DB) -> dict:
    result = await db.execute(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id
        )
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise ResourceNotFound("Savings goal")
    await db.delete(goal)
    return {"detail": "Savings goal deleted"}
