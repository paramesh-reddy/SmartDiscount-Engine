from decimal import Decimal
from sqlalchemy import select
from app.core.database import SessionLocal
from app.models.cart import Cart
from app.models.cart_item import CartItem
from app.models.discount_rule import DiscountRule
from app.services.cart_service import CartService

SEED_RULES = [
    {
        "rule_code": "RULE-01",
        "scope": "platform",
        "applies_to": "Amazon India",
        "discount_type": "percentage",
        "value": Decimal("15"),
        "stackable": False,
        "min_cart_value": None,
        "is_active": True,
    },
    {
        "rule_code": "RULE-02",
        "scope": "brand",
        "applies_to": "Natura Casa",
        "discount_type": "flat",
        "value": Decimal("150"),
        "stackable": False,
        "min_cart_value": None,
        "is_active": True,
    },
    {
        "rule_code": "RULE-03",
        "scope": "platform",
        "applies_to": "Flipkart",
        "discount_type": "percentage",
        "value": Decimal("10"),
        "stackable": True,
        "min_cart_value": None,
        "is_active": True,
    },
    {
        "rule_code": "RULE-04",
        "scope": "cart",
        "applies_to": None,
        "discount_type": "percentage",
        "value": Decimal("10"),
        "stackable": False,
        "min_cart_value": Decimal("4000"),
        "is_active": True,
    },
]

SEED_CART_ITEMS = [
    ("Cushion Cover", "Natura Casa", "Amazon India", Decimal("1299")),
    ("Bed Sheet Set", "Natura Casa", "Flipkart", Decimal("849")),
    ("Wall Shelf", "LivSpace Pro", "Amazon India", Decimal("599")),
    ("Ceramic Vase", "LivSpace Pro", "Noon", Decimal("2499")),
    ("Cutting Board", "Nordic Basics", "Amazon India", Decimal("449")),
    ("Desk Organiser", "Nordic Basics", "Flipkart", Decimal("899")),
]


def seed_database() -> None:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured.")
    db = SessionLocal()
    try:
        for rule_data in SEED_RULES:
            exists = db.scalar(select(DiscountRule).where(DiscountRule.rule_code == rule_data["rule_code"]))
            if not exists:
                db.add(DiscountRule(**rule_data))
        db.commit()

        existing_cart = db.scalar(select(Cart))
        if not existing_cart:
            cart = Cart(cart_name="Opptra Sample Cart", currency="INR")
            for product, brand, platform, price in SEED_CART_ITEMS:
                cart.items.append(
                    CartItem(
                        product_name=product,
                        brand=brand,
                        platform=platform,
                        base_price=price,
                        final_price=price,
                        discount_amount=Decimal("0"),
                    )
                )
            db.add(cart)
            db.commit()
            db.refresh(cart)
            CartService(db).calculate_and_persist(cart.id)
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
    print("Seeded Opptra discount rules and sample cart.")
