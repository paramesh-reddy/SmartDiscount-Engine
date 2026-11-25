from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.repositories.discount_repository import DiscountRepository
from app.schemas.discount_rule import (
    DiscountRuleCreate,
    DiscountRuleListResponse,
    DiscountRuleRead,
    DiscountRuleUpdate,
)
from app.services.cart_service import CartService

router = APIRouter(prefix="/discount-rules", tags=["Discount Rules"])


@router.get("", response_model=DiscountRuleListResponse)
def list_discount_rules(
    scope: str | None = None,
    platform: str | None = None,
    brand: str | None = None,
    discount_type: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> DiscountRuleListResponse:
    repo = DiscountRepository(db)
    items, total = repo.list_rules(
        scope=scope,
        platform=platform,
        brand=brand,
        discount_type=discount_type,
        is_active=is_active,
        search=search,
        page=page,
        limit=limit,
    )
    return DiscountRuleListResponse(items=[DiscountRuleRead.model_validate(i) for i in items], total=total)


@router.post("", response_model=DiscountRuleRead, status_code=status.HTTP_201_CREATED)
def create_discount_rule(payload: DiscountRuleCreate, db: Session = Depends(get_db)) -> DiscountRuleRead:
    repo = DiscountRepository(db)
    created = repo.create(payload)
    CartService(db).recalculate_all_carts()
    return DiscountRuleRead.model_validate(created)


@router.get("/{rule_id}", response_model=DiscountRuleRead)
def get_discount_rule(rule_id: UUID, db: Session = Depends(get_db)) -> DiscountRuleRead:
    rule = DiscountRepository(db).get_by_id(rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount rule not found.")
    return DiscountRuleRead.model_validate(rule)


@router.put("/{rule_id}", response_model=DiscountRuleRead)
def update_discount_rule(
    rule_id: UUID, payload: DiscountRuleUpdate, db: Session = Depends(get_db)
) -> DiscountRuleRead:
    repo = DiscountRepository(db)
    rule = repo.get_by_id(rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount rule not found.")
    updated = repo.update(rule, payload)
    CartService(db).recalculate_all_carts()
    return DiscountRuleRead.model_validate(updated)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_discount_rule(rule_id: UUID, db: Session = Depends(get_db)) -> None:
    repo = DiscountRepository(db)
    rule = repo.get_by_id(rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount rule not found.")
    repo.delete(rule)
    CartService(db).recalculate_all_carts()
