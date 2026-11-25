import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class DiscountRule(Base):
    __tablename__ = "discount_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # platform | brand | cart
    applies_to: Mapped[str | None] = mapped_column(String(150), nullable=True)
    discount_type: Mapped[str] = mapped_column(String(20), nullable=False)  # percentage | flat
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    stackable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    min_cart_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
