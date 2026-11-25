from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class DiscountRuleBase(BaseModel):
    rule_code: str | None = Field(default=None, max_length=64)
    scope: Literal["platform", "brand", "cart"]
    applies_to: str | None = Field(default=None, max_length=150)
    discount_type: Literal["percentage", "flat"]
    value: Decimal = Field(gt=Decimal("0"))
    stackable: bool = False
    min_cart_value: Decimal | None = Field(default=None, gt=Decimal("0"))
    is_active: bool = True

    @model_validator(mode="after")
    def validate_rule_constraints(self) -> "DiscountRuleBase":
        if self.discount_type == "percentage" and self.value > Decimal("100"):
            raise ValueError("Percentage discount must be greater than 0 and at most 100.")
        if self.scope in ("platform", "brand") and (not self.applies_to or not self.applies_to.strip()):
            raise ValueError(f"applies_to is required when scope is '{self.scope}'.")
        if self.scope == "cart" and self.min_cart_value is None:
            raise ValueError("min_cart_value is required when scope is 'cart'.")
        if self.scope == "cart":
            self.applies_to = None
        else:
            self.min_cart_value = None
        return self


class DiscountRuleCreate(DiscountRuleBase):
    pass


class DiscountRuleUpdate(BaseModel):
    rule_code: str | None = Field(default=None, max_length=64)
    scope: Literal["platform", "brand", "cart"] | None = None
    applies_to: str | None = Field(default=None, max_length=150)
    discount_type: Literal["percentage", "flat"] | None = None
    value: Decimal | None = Field(default=None, gt=Decimal("0"))
    stackable: bool | None = None
    min_cart_value: Decimal | None = Field(default=None, gt=Decimal("0"))
    is_active: bool | None = None


class DiscountRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rule_code: str
    scope: Literal["platform", "brand", "cart"]
    applies_to: str | None
    discount_type: Literal["percentage", "flat"]
    value: Decimal
    stackable: bool
    min_cart_value: Decimal | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DiscountRuleListResponse(BaseModel):
    items: list[DiscountRuleRead]
    total: int
