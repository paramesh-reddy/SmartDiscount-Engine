from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.repositories.cart_repository import CartRepository
from app.schemas.calculation import CalculationHistoryResponse, CalculationResultRead
from app.services.cart_service import CartService

router = APIRouter(prefix="/carts", tags=["Calculations"])


@router.post("/{cart_id}/calculate", response_model=CalculationResultRead)
def calculate_cart(cart_id: UUID, db: Session = Depends(get_db)) -> CalculationResultRead:
    result = CartService(db).calculate_and_persist(cart_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart not found.")
    return CalculationResultRead.model_validate(result)


@router.get("/{cart_id}/results", response_model=CalculationHistoryResponse)
def get_cart_results(
    cart_id: UUID, limit: int = Query(default=20, ge=1, le=50), db: Session = Depends(get_db)
) -> CalculationHistoryResponse:
    repo = CartRepository(db)
    if repo.get_by_id(cart_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart not found.")
    rows = repo.list_calculations(cart_id, limit=limit)
    return CalculationHistoryResponse(
        items=[CalculationResultRead.model_validate(r) for r in rows],
        total=len(rows),
    )
