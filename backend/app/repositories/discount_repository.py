from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.discount_rule import DiscountRule
from app.schemas.discount_rule import DiscountRuleCreate, DiscountRuleUpdate


class DiscountRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_rules(
        self,
        scope: str | None = None,
        platform: str | None = None,
        brand: str | None = None,
        discount_type: str | None = None,
        is_active: bool | None = None,
        search: str | None = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[DiscountRule], int]:
        stmt = select(DiscountRule)
        if scope and scope != "all":
            stmt = stmt.where(DiscountRule.scope == scope.lower())
        if discount_type and discount_type != "all":
            stmt = stmt.where(DiscountRule.discount_type == discount_type.lower())
        if platform and platform != "all":
            stmt = stmt.where(DiscountRule.scope == "platform", func.lower(DiscountRule.applies_to) == platform.lower())
        if brand and brand != "all":
            stmt = stmt.where(DiscountRule.scope == "brand", func.lower(DiscountRule.applies_to) == brand.lower())
        if is_active is not None:
            stmt = stmt.where(DiscountRule.is_active == is_active)
        if search:
            pattern = f"%{search.strip().lower()}%"
            stmt = stmt.where(
                func.lower(DiscountRule.rule_code).like(pattern)
                | func.lower(func.coalesce(DiscountRule.applies_to, "")).like(pattern)
            )

        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = list(
            self.db.scalars(
                stmt.order_by(DiscountRule.rule_code.asc()).offset((page - 1) * limit).limit(limit)
            ).all()
        )
        return items, total

    def get_all_rules(self) -> list[DiscountRule]:
        return list(self.db.scalars(select(DiscountRule).order_by(DiscountRule.rule_code.asc())).all())

    def get_by_id(self, rule_id: UUID) -> DiscountRule | None:
        return self.db.get(DiscountRule, rule_id)

    def next_rule_code(self) -> str:
        rules = self.get_all_rules()
        max_num = 0
        for r in rules:
            if r.rule_code.upper().startswith("RULE-"):
                suffix = r.rule_code.split("-", 1)[1]
                if suffix.isdigit():
                    max_num = max(max_num, int(suffix))
        return f"RULE-{max_num + 1:02d}"

    def create(self, payload: DiscountRuleCreate) -> DiscountRule:
        rule_code = payload.rule_code.strip() if payload.rule_code else self.next_rule_code()
        rule = DiscountRule(
            rule_code=rule_code,
            scope=payload.scope,
            applies_to=payload.applies_to,
            discount_type=payload.discount_type,
            value=payload.value,
            stackable=payload.stackable,
            min_cart_value=payload.min_cart_value,
            is_active=payload.is_active,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def update(self, rule: DiscountRule, payload: DiscountRuleUpdate) -> DiscountRule:
        data = payload.model_dump(exclude_unset=True)
        for field, val in data.items():
            setattr(rule, field, val)
        if rule.scope == "cart":
            rule.applies_to = None
        else:
            rule.min_cart_value = None
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def delete(self, rule: DiscountRule) -> None:
        self.db.delete(rule)
        self.db.commit()
