"""Pure Decimal discount calculation engine independent of FastAPI and database layers."""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

ZERO = Decimal("0")
HUNDRED = Decimal("100")


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _to_decimal(value: Decimal | int | float | str | None) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def round_inr(value: Decimal) -> Decimal:
    return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class EngineRule:
    id: str
    rule_code: str
    scope: str  # platform | brand | cart
    applies_to: str | None
    discount_type: str  # percentage | flat
    value: Decimal
    stackable: bool
    min_cart_value: Decimal | None = None
    is_active: bool = True


@dataclass(frozen=True)
class EngineCartItem:
    id: str
    product_name: str
    brand: str
    platform: str
    base_price: Decimal


def rule_matches_item(item: EngineCartItem, rule: EngineRule) -> bool:
    if not rule.is_active:
        return False
    if rule.scope == "brand":
        return _norm(item.brand) != "" and _norm(item.brand) == _norm(rule.applies_to)
    if rule.scope == "platform":
        return _norm(item.platform) != "" and _norm(item.platform) == _norm(rule.applies_to)
    return False


def calculate_rule_saving(current_price: Decimal, rule: EngineRule) -> Decimal:
    if current_price <= ZERO or rule.value <= ZERO:
        return ZERO
    if rule.discount_type == "percentage":
        raw_saving = round_inr((current_price * rule.value) / HUNDRED)
    else:
        raw_saving = round_inr(rule.value)
    return min(current_price, max(ZERO, raw_saving))


def _format_rule_phrase(rule: EngineRule) -> str:
    target = (rule.applies_to or rule.scope).strip()
    if rule.discount_type == "percentage":
        pct = rule.value.normalize()
        pct_str = str(int(pct)) if pct == pct.to_integral_value() else str(pct)
        if rule.scope == "cart":
            return f"{pct_str}% cart discount"
        scope_label = "brand " if rule.scope == "brand" else ""
        return f"{pct_str}% {target} {scope_label}discount"
    amt = int(round_inr(rule.value))
    if rule.scope == "cart":
        return f"Rs.{amt:,} cart discount"
    scope_label = "brand " if rule.scope == "brand" else ""
    return f"Rs.{amt:,} {target} {scope_label}discount"


def calculate_item_discounts(item: EngineCartItem, rules: list[EngineRule]) -> dict[str, Any]:
    base_price = max(ZERO, round_inr(_to_decimal(item.base_price)))
    matching = sorted((r for r in rules if rule_matches_item(item, r)), key=lambda r: r.rule_code)

    if not matching:
        return {
            "item_id": item.id,
            "product_name": item.product_name,
            "brand": item.brand,
            "platform": item.platform,
            "base_price": int(base_price),
            "final_price": int(base_price),
            "discount_amount": 0,
            "matched_rules": [],
            "winning_non_stackable": None,
            "stackable_rules": [],
            "skipped_rules": [],
            "explanation": "No offers available.",
        }

    non_stackable = [r for r in matching if not r.stackable]
    stackable = [r for r in matching if r.stackable]

    matched_details = [
        {
            "id": r.id,
            "rule_code": r.rule_code,
            "scope": r.scope,
            "applies_to": r.applies_to,
            "discount_type": r.discount_type,
            "value": float(r.value),
            "stackable": r.stackable,
            "saving_amount": int(calculate_rule_saving(base_price, r)),
        }
        for r in matching
    ]

    winner: EngineRule | None = None
    skipped: list[dict[str, Any]] = []
    if non_stackable:
        ranked = sorted(
            non_stackable,
            key=lambda r: (-calculate_rule_saving(base_price, r), r.rule_code),
        )
        winner = ranked[0]
        for loser in ranked[1:]:
            skipped.append(
                {
                    "rule_code": loser.rule_code,
                    "scope": loser.scope,
                    "potential_saving": int(calculate_rule_saving(base_price, loser)),
                }
            )

    running_price = base_price
    winning_detail: dict[str, Any] | None = None
    stackable_details: list[dict[str, Any]] = []
    phrases: list[str] = []

    if winner is not None:
        saving = calculate_rule_saving(running_price, winner)
        running_price = max(ZERO, running_price - saving)
        winning_detail = {
            "id": winner.id,
            "rule_code": winner.rule_code,
            "scope": winner.scope,
            "applies_to": winner.applies_to,
            "discount_type": winner.discount_type,
            "value": float(winner.value),
            "stackable": False,
            "saving_amount": int(saving),
        }
        phrases.append(_format_rule_phrase(winner))

    for s_rule in stackable:
        saving = calculate_rule_saving(running_price, s_rule)
        running_price = max(ZERO, running_price - saving)
        stackable_details.append(
            {
                "id": s_rule.id,
                "rule_code": s_rule.rule_code,
                "scope": s_rule.scope,
                "applies_to": s_rule.applies_to,
                "discount_type": s_rule.discount_type,
                "value": float(s_rule.value),
                "stackable": True,
                "saving_amount": int(saving),
            }
        )
        phrases.append(f"{_format_rule_phrase(s_rule)} (stackable)")

    final_price = max(ZERO, round_inr(running_price))
    total_saved = max(ZERO, base_price - final_price)
    explanation = (
        f"{' + '.join(phrases)} applied. You saved Rs.{int(total_saved):,}."
        if total_saved > ZERO
        else "No offers available."
    )

    return {
        "item_id": item.id,
        "product_name": item.product_name,
        "brand": item.brand,
        "platform": item.platform,
        "base_price": int(base_price),
        "final_price": int(final_price),
        "discount_amount": int(total_saved),
        "matched_rules": matched_details,
        "winning_non_stackable": winning_detail,
        "stackable_rules": stackable_details,
        "skipped_rules": skipped,
        "explanation": explanation,
    }


def calculate_cart_discounts(items: list[EngineCartItem], rules: list[EngineRule]) -> dict[str, Any]:
    if not items:
        return {
            "original_total": 0,
            "item_discount_total": 0,
            "pre_cart_discount_total": 0,
            "cart_discount_total": 0,
            "final_total": 0,
            "total_savings": 0,
            "items": [],
            "applied_cart_rules": [],
            "skipped_cart_rules": [],
            "cart_explanation": "Cart is empty. Add items to calculate discounts.",
            "rounding_policy": "INR integer rounding using Decimal ROUND_HALF_UP at each sequential discount step.",
        }

    item_details = [calculate_item_discounts(item, rules) for item in items]
    original_total = sum((Decimal(d["base_price"]) for d in item_details), ZERO)
    item_discount_total = sum((Decimal(d["discount_amount"]) for d in item_details), ZERO)
    pre_cart_total = sum((Decimal(d["final_price"]) for d in item_details), ZERO)

    active_cart_rules = sorted((r for r in rules if r.is_active and r.scope == "cart"), key=lambda r: r.rule_code)
    qualifying: list[EngineRule] = []
    skipped_cart: list[dict[str, str]] = []

    for c_rule in active_cart_rules:
        min_val = c_rule.min_cart_value if c_rule.min_cart_value is not None else ZERO
        if pre_cart_total >= min_val:
            qualifying.append(c_rule)
        else:
            skipped_cart.append(
                {
                    "rule_code": c_rule.rule_code,
                    "reason": f"Requires pre-cart total of Rs.{int(round_inr(min_val)):,} (current Rs.{int(pre_cart_total):,}).",
                }
            )

    non_stackable_cart = [r for r in qualifying if not r.stackable]
    stackable_cart = [r for r in qualifying if r.stackable]

    winning_cart: EngineRule | None = None
    if non_stackable_cart:
        ranked = sorted(
            non_stackable_cart,
            key=lambda r: (-calculate_rule_saving(pre_cart_total, r), r.rule_code),
        )
        winning_cart = ranked[0]
        for loser in ranked[1:]:
            skipped_cart.append(
                {"rule_code": loser.rule_code, "reason": f"Outperformed by {winning_cart.rule_code}."}
            )

    running_cart_total = pre_cart_total
    applied_cart: list[dict[str, Any]] = []
    cart_phrases: list[str] = []

    if winning_cart is not None:
        saving = calculate_rule_saving(running_cart_total, winning_cart)
        running_cart_total = max(ZERO, running_cart_total - saving)
        applied_cart.append(
            {
                "id": winning_cart.id,
                "rule_code": winning_cart.rule_code,
                "scope": "cart",
                "applies_to": None,
                "discount_type": winning_cart.discount_type,
                "value": float(winning_cart.value),
                "stackable": False,
                "saving_amount": int(saving),
            }
        )
        cart_phrases.append(_format_rule_phrase(winning_cart))

    for s_cart in stackable_cart:
        saving = calculate_rule_saving(running_cart_total, s_cart)
        running_cart_total = max(ZERO, running_cart_total - saving)
        applied_cart.append(
            {
                "id": s_cart.id,
                "rule_code": s_cart.rule_code,
                "scope": "cart",
                "applies_to": None,
                "discount_type": s_cart.discount_type,
                "value": float(s_cart.value),
                "stackable": True,
                "saving_amount": int(saving),
            }
        )
        cart_phrases.append(f"{_format_rule_phrase(s_cart)} (stackable)")

    final_total = max(ZERO, round_inr(running_cart_total))
    cart_discount_total = max(ZERO, pre_cart_total - final_total)
    total_savings = max(ZERO, original_total - final_total)

    if applied_cart and cart_discount_total > ZERO:
        cart_explanation = f"{' + '.join(cart_phrases)} applied. You saved Rs.{int(cart_discount_total):,}."
    elif skipped_cart:
        cart_explanation = skipped_cart[0]["reason"]
    else:
        cart_explanation = "No cart-level discount triggered."

    return {
        "original_total": int(original_total),
        "item_discount_total": int(item_discount_total),
        "pre_cart_discount_total": int(pre_cart_total),
        "cart_discount_total": int(cart_discount_total),
        "final_total": int(final_total),
        "total_savings": int(total_savings),
        "items": item_details,
        "applied_cart_rules": applied_cart,
        "skipped_cart_rules": skipped_cart,
        "cart_explanation": cart_explanation,
        "rounding_policy": "INR integer rounding using Decimal ROUND_HALF_UP at each sequential discount step.",
    }
