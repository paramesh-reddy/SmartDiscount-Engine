from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class CalculationResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cart_id: UUID
    original_total: Decimal
    item_discount_total: Decimal
    cart_discount_total: Decimal
    final_total: Decimal
    calculation_details: dict[str, Any]
    created_at: datetime


class CalculationHistoryResponse(BaseModel):
    items: list[CalculationResultRead]
    total: int
