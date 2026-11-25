from decimal import Decimal
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.calculation import CalculationResult
from app.models.cart import Cart
from app.repositories.cart_repository import CartRepository
from app.repositories.discount_repository import DiscountRepository
from app.services.discount_engine import EngineCartItem, EngineRule, calculate_cart_discounts


class CartService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.cart_repo = CartRepository(db)
        self.rule_repo = DiscountRepository(db)

    def calculate_and_persist(self, cart_id: UUID) -> CalculationResult | None:
        cart = self.cart_repo.get_by_id(cart_id)
        if cart is None:
            return None

        rules = [
            EngineRule(
                id=str(r.id),
                rule_code=r.rule_code,
                scope=r.scope,
                applies_to=r.applies_to,
                discount_type=r.discount_type,
                value=Decimal(r.value),
                stackable=r.stackable,
                min_cart_value=Decimal(r.min_cart_value) if r.min_cart_value is not None else None,
                is_active=r.is_active,
            )
            for r in self.rule_repo.get_all_rules()
        ]

        items = [
            EngineCartItem(
                id=str(item.id),
                product_name=item.product_name,
                brand=item.brand,
                platform=item.platform,
                base_price=Decimal(item.base_price),
            )
            for item in cart.items
        ]

        calc = calculate_cart_discounts(items, rules)
        detail_map = {d["item_id"]: d for d in calc["items"]}

        for item in cart.items:
            d = detail_map.get(str(item.id))
            if d:
                item.final_price = Decimal(str(d["final_price"]))
                item.discount_amount = Decimal(str(d["discount_amount"]))

        cart.original_total = Decimal(str(calc["original_total"]))
        cart.item_discount_total = Decimal(str(calc["item_discount_total"]))
        cart.cart_discount_total = Decimal(str(calc["cart_discount_total"]))
        cart.final_total = Decimal(str(calc["final_total"]))

        record = CalculationResult(
            cart_id=cart.id,
            original_total=cart.original_total,
            item_discount_total=cart.item_discount_total,
            cart_discount_total=cart.cart_discount_total,
            final_total=cart.final_total,
            calculation_details=calc,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def recalculate_all_carts(self) -> None:
        carts: list[Cart] = self.cart_repo.list_carts()
        for c in carts:
            self.calculate_and_persist(c.id)
