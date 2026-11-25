from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.repositories.cart_repository import CartRepository
from app.schemas.cart import (
    CartCreate,
    CartItemCreate,
    CartItemRead,
    CartItemUpdate,
    CartListResponse,
    CartRead,
    CartUpdate,
)
from app.services.cart_service import CartService

router = APIRouter(prefix="/carts", tags=["Carts"])


def _enrich_cart(cart, db: Session) -> CartRead:
    repo = CartRepository(db)
    latest = repo.list_calculations(cart.id, limit=1)
    exp_map = {}
    if latest:
        for item_detail in latest[0].calculation_details.get("items", []):
            exp_map[str(item_detail["item_id"])] = item_detail.get("explanation", "No offers available.")
    cart_read = CartRead.model_validate(cart)
    for idx, item in enumerate(cart_read.items):
        cart_read.items[idx] = CartItemRead(
            **item.model_dump(exclude={"explanation"}),
            explanation=exp_map.get(str(item.id), "No offers available."),
        )
    return cart_read


@router.get("", response_model=CartListResponse)
def list_carts(db: Session = Depends(get_db)) -> CartListResponse:
    carts = CartRepository(db).list_carts()
    return CartListResponse(items=[_enrich_cart(c, db) for c in carts], total=len(carts))


@router.post("", response_model=CartRead, status_code=status.HTTP_201_CREATED)
def create_cart(payload: CartCreate, db: Session = Depends(get_db)) -> CartRead:
    cart = CartRepository(db).create(payload)
    CartService(db).calculate_and_persist(cart.id)
    refreshed = CartRepository(db).get_by_id(cart.id)
    return _enrich_cart(refreshed, db)


@router.get("/{cart_id}", response_model=CartRead)
def get_cart(cart_id: UUID, db: Session = Depends(get_db)) -> CartRead:
    cart = CartRepository(db).get_by_id(cart_id)
    if cart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart not found.")
    return _enrich_cart(cart, db)


@router.put("/{cart_id}", response_model=CartRead)
def update_cart(cart_id: UUID, payload: CartUpdate, db: Session = Depends(get_db)) -> CartRead:
    repo = CartRepository(db)
    cart = repo.get_by_id(cart_id)
    if cart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart not found.")
    if payload.items is not None:
        repo.replace_items(cart, payload.items, cart_name=payload.cart_name)
    elif payload.cart_name is not None:
        cart.cart_name = payload.cart_name.strip()
        db.commit()
    CartService(db).calculate_and_persist(cart.id)
    return _enrich_cart(repo.get_by_id(cart.id), db)


@router.delete("/{cart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cart(cart_id: UUID, db: Session = Depends(get_db)) -> None:
    repo = CartRepository(db)
    cart = repo.get_by_id(cart_id)
    if cart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart not found.")
    repo.delete_cart(cart)


@router.post("/{cart_id}/items", response_model=CartRead, status_code=status.HTTP_201_CREATED)
def add_cart_item(cart_id: UUID, payload: CartItemCreate, db: Session = Depends(get_db)) -> CartRead:
    repo = CartRepository(db)
    cart = repo.get_by_id(cart_id)
    if cart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart not found.")
    repo.add_item(cart, payload)
    CartService(db).calculate_and_persist(cart.id)
    return _enrich_cart(repo.get_by_id(cart.id), db)


@router.put("/{cart_id}/items/{item_id}", response_model=CartRead)
def update_cart_item(
    cart_id: UUID, item_id: UUID, payload: CartItemUpdate, db: Session = Depends(get_db)
) -> CartRead:
    repo = CartRepository(db)
    item = repo.get_item(cart_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found.")
    repo.update_item(item, payload)
    CartService(db).calculate_and_persist(cart_id)
    return _enrich_cart(repo.get_by_id(cart_id), db)


@router.delete("/{cart_id}/items/{item_id}", response_model=CartRead)
def delete_cart_item(cart_id: UUID, item_id: UUID, db: Session = Depends(get_db)) -> CartRead:
    repo = CartRepository(db)
    item = repo.get_item(cart_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found.")
    repo.delete_item(item)
    CartService(db).calculate_and_persist(cart_id)
    return _enrich_cart(repo.get_by_id(cart_id), db)
