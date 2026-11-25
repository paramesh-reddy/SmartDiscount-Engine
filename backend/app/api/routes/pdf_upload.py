from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import validate_pdf_upload
from app.repositories.cart_repository import CartRepository
from app.schemas.calculation import CalculationResultRead
from app.schemas.cart import CartCreate, CartRead, PdfImportPreviewRequest
from app.services.cart_service import CartService
from app.services.pdf_parser import extract_cart_from_pdf

router = APIRouter(prefix="/carts", tags=["PDF Upload"])


@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)) -> dict:
    settings = get_settings()
    payload = await file.read()
    validate_pdf_upload(file.filename, file.content_type, payload, settings.max_pdf_bytes)
    return extract_cart_from_pdf(payload, file.filename or "cart.pdf")


@router.post("/import-pdf-preview")
def import_pdf_preview(payload: PdfImportPreviewRequest, db: Session = Depends(get_db)) -> dict:
    repo = CartRepository(db)
    target_cart = repo.get_by_id(payload.cart_id) if payload.cart_id else None
    if payload.cart_id and target_cart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target cart not found.")

    if target_cart is None:
        existing = repo.list_carts()
        target_cart = existing[0] if existing else None

    if target_cart is not None:
        updated_cart = repo.replace_items(target_cart, payload.items, cart_name=payload.cart_name)
    else:
        updated_cart = repo.create(
            CartCreate(cart_name=payload.cart_name or "Imported PDF Cart", items=payload.items)
        )

    calc = CartService(db).calculate_and_persist(updated_cart.id)
    refreshed = repo.get_by_id(updated_cart.id)
    return {
        "cart": CartRead.model_validate(refreshed),
        "calculation": CalculationResultRead.model_validate(calc) if calc else None,
    }
