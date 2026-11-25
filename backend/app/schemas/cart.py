from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class CartItemCreate(BaseModel):
    product_name: str = Field(min_length=1, max_length=180)
    brand: str = Field(min_length=1, max_length=120)
    platform: str = Field(min_length=1, max_length=120)
    base_price: Decimal = Field(gt=Decimal("0"))


class CartItemUpdate(BaseModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=180)
    brand: str | None = Field(default=None, min_length=1, max_length=120)
    platform: str | None = Field(default=None, min_length=1, max_length=120)
    base_price: Decimal | None = Field(default=None, gt=Decimal("0"))


class CartItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cart_id: UUID
    product_name: str
    brand: str
    platform: str
    base_price: Decimal
    final_price: Decimal
    discount_amount: Decimal
    explanation: str | None = None
    created_at: datetime


class CartCreate(BaseModel):
    cart_name: str = Field(min_length=1, max_length=180)
    currency: str = Field(default="INR", max_length=10)
    items: list[CartItemCreate] = Field(default_factory=list)


class CartUpdate(BaseModel):
    cart_name: str | None = Field(default=None, min_length=1, max_length=180)
    items: list[CartItemCreate] | None = None


class CartRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cart_name: str
    currency: str
    original_total: Decimal
    item_discount_total: Decimal
    cart_discount_total: Decimal
    final_total: Decimal
    created_at: datetime
    updated_at: datetime
    items: list[CartItemRead] = Field(default_factory=list)


class CartListResponse(BaseModel):
    items: list[CartRead]
    total: int


class PdfImportPreviewRequest(BaseModel):
    cart_id: UUID | None = None
    cart_name: str | None = Field(default=None, min_length=1, max_length=180)
    items: list[CartItemCreate] = Field(min_length=1)
