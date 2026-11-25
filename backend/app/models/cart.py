import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Cart(Base):
    __tablename__ = "carts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cart_name: Mapped[str] = mapped_column(String(180), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    original_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    item_discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    cart_discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    final_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan", order_by="CartItem.created_at")
    calculations = relationship(
        "CalculationResult", back_populates="cart", cascade="all, delete-orphan", order_by="CalculationResult.created_at.desc()"
    )
