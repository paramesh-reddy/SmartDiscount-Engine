import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class CalculationResult(Base):
    __tablename__ = "calculation_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cart_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    item_discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cart_discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    final_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    calculation_details: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    cart = relationship("Cart", back_populates="calculations")
