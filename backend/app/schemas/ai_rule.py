from typing import Literal
from pydantic import BaseModel, Field, model_validator


class AiRuleParseRequest(BaseModel):
    text: str = Field(min_length=3, max_length=600)


class AiRuleParseResponse(BaseModel):
    scope: Literal["brand", "platform", "cart"] | None = None
    applies_to: str | None = None
    discount_type: Literal["percentage", "flat"] | None = None
    value: float | None = None
    stackable: bool = False
    min_cart_value: float | None = None
    is_valid: bool
    clarification_message: str | None = None

    @model_validator(mode="after")
    def validate_ai_rule(self) -> "AiRuleParseResponse":
        if not self.is_valid:
            if not self.clarification_message or not self.clarification_message.strip():
                self.clarification_message = (
                    "Please specify the target (brand, platform, or minimum cart value), discount type, and value."
                )
            return self

        if self.scope is None or self.discount_type is None or self.value is None:
            self.is_valid = False
            self.clarification_message = "Missing scope, discount type, or discount value."
            return self

        if self.discount_type == "percentage" and (self.value <= 0 or self.value > 100):
            self.is_valid = False
            self.clarification_message = "Percentage discount must be greater than 0 and at most 100."
            return self

        if self.discount_type == "flat" and self.value <= 0:
            self.is_valid = False
            self.clarification_message = "Flat discount amount must be positive."
            return self

        if self.scope in ("brand", "platform") and (not self.applies_to or not self.applies_to.strip()):
            self.is_valid = False
            self.clarification_message = f"Please specify which {self.scope} this rule applies to."
            return self

        if self.scope == "cart":
            self.applies_to = None
            if self.min_cart_value is None or self.min_cart_value <= 0:
                self.is_valid = False
                self.clarification_message = "Please specify a positive minimum cart value for cart-level discounts."
                return self
        else:
            self.min_cart_value = None

        return self
