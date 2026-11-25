from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload
from app.models.calculation import CalculationResult
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.schemas.cart import CartCreate, CartItemCreate, CartItemUpdate


class CartRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_carts(self) -> list[Cart]:
        stmt = select(Cart).options(joinedload(Cart.items)).order_by(Cart.created_at.asc())
        return list(self.db.scalars(stmt).unique().all())

    def get_by_id(self, cart_id: UUID) -> Cart | None:
        stmt = select(Cart).options(joinedload(Cart.items)).where(Cart.id == cart_id)
        return self.db.scalar(stmt)

    def create(self, payload: CartCreate) -> Cart:
        cart = Cart(cart_name=payload.cart_name.strip(), currency=payload.currency)
        for item_data in payload.items:
            cart.items.append(
                CartItem(
                    product_name=item_data.product_name.strip(),
                    brand=item_data.brand.strip(),
                    platform=item_data.platform.strip(),
                    base_price=item_data.base_price,
                    final_price=item_data.base_price,
                )
            )
        self.db.add(cart)
        self.db.commit()
        self.db.refresh(cart)
        return cart

    def replace_items(self, cart: Cart, items: list[CartItemCreate], cart_name: str | None = None) -> Cart:
        if cart_name:
            cart.cart_name = cart_name.strip()
        cart.items.clear()
        self.db.flush()
        for item_data in items:
            cart.items.append(
                CartItem(
                    product_name=item_data.product_name.strip(),
                    brand=item_data.brand.strip(),
                    platform=item_data.platform.strip(),
                    base_price=item_data.base_price,
                    final_price=item_data.base_price,
                )
            )
        self.db.commit()
        self.db.refresh(cart)
        return cart

    def add_item(self, cart: Cart, item_data: CartItemCreate) -> Cart:
        cart.items.append(
            CartItem(
                product_name=item_data.product_name.strip(),
                brand=item_data.brand.strip(),
                platform=item_data.platform.strip(),
                base_price=item_data.base_price,
                final_price=item_data.base_price,
            )
        )
        self.db.commit()
        self.db.refresh(cart)
        return cart

    def get_item(self, cart_id: UUID, item_id: UUID) -> CartItem | None:
        stmt = select(CartItem).where(CartItem.id == item_id, CartItem.cart_id == cart_id)
        return self.db.scalar(stmt)

    def update_item(self, item: CartItem, payload: CartItemUpdate) -> None:
        for field, val in payload.model_dump(exclude_unset=True).items():
            setattr(item, field, val.strip() if isinstance(val, str) else val)
        self.db.commit()

    def delete_item(self, item: CartItem) -> None:
        self.db.delete(item)
        self.db.commit()

    def delete_cart(self, cart: Cart) -> None:
        self.db.delete(cart)
        self.db.commit()

    def list_calculations(self, cart_id: UUID, limit: int = 20) -> list[CalculationResult]:
        stmt = (
            select(CalculationResult)
            .where(CalculationResult.cart_id == cart_id)
            .order_by(CalculationResult.created_at.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())
