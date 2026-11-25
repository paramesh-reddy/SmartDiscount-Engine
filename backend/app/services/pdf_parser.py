import io
import re
from decimal import Decimal
from typing import Any
import pdfplumber
from pydantic import ValidationError
from app.schemas.cart import CartItemCreate


def _parse_price(raw: str) -> Decimal | None:
    cleaned = re.sub(r"(rs\.?|inr|₹|,)", "", raw or "", flags=re.IGNORECASE).strip()
    if not re.match(r"^-?\d+(\.\d+)?$", cleaned):
        return None
    return Decimal(cleaned)


def _is_header_row(cells: list[str]) -> bool:
    joined = " ".join(c.lower() for c in cells)
    return "product" in joined and "brand" in joined and "platform" in joined and "price" in joined


def extract_cart_from_pdf(payload: bytes, filename: str) -> dict[str, Any]:
    valid_rows: list[dict[str, Any]] = []
    malformed_rows: list[dict[str, Any]] = []
    warnings: list[str] = []
    logical_row = 0

    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        total_pages = len(pdf.pages)
        for page in pdf.pages:
            tables = page.extract_tables() or []
            candidate_rows: list[list[str]] = []
            if tables:
                for table in tables:
                    for row in table:
                        candidate_rows.append([(cell or "").strip() for cell in row])
            else:
                text = page.extract_text() or ""
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    if "|" in line:
                        candidate_rows.append([c.strip() for c in line.split("|") if c.strip()])
                    else:
                        candidate_rows.append([c.strip() for c in re.split(r"\s{2,}", line) if c.strip()])

            for cells in candidate_rows:
                if not cells or _is_header_row(cells):
                    continue
                if len(cells) == 1 and not re.search(r"\d", cells[0]):
                    continue

                logical_row += 1
                normalized = cells[1:] if len(cells) >= 5 and re.match(r"^item[-_\s]?\d+", cells[0], re.I) else cells

                if len(normalized) < 4:
                    malformed_rows.append(
                        {
                            "row_number": logical_row,
                            "raw_text": " | ".join(cells),
                            "errors": [f"Expected 4 columns (Product, Brand, Platform, Base Price), found {len(normalized)}."],
                            "partial": {
                                "product_name": normalized[0] if len(normalized) > 0 else "",
                                "brand": normalized[1] if len(normalized) > 1 else "",
                                "platform": normalized[2] if len(normalized) > 2 else "",
                                "base_price": normalized[3] if len(normalized) > 3 else "",
                            },
                        }
                    )
                    continue

                product, brand, platform, price_raw = normalized[:4]
                price = _parse_price(price_raw)
                errors: list[str] = []
                if not product:
                    errors.append("Product name is missing.")
                if not brand:
                    errors.append("Brand is missing.")
                if not platform:
                    errors.append("Platform is missing.")
                if price is None:
                    errors.append(f"Invalid base price '{price_raw}'.")
                elif price <= 0:
                    errors.append(f"Base price must be positive, got {price}.")

                if errors or price is None:
                    malformed_rows.append(
                        {
                            "row_number": logical_row,
                            "raw_text": " | ".join(cells),
                            "errors": errors,
                            "partial": {
                                "product_name": product,
                                "brand": brand,
                                "platform": platform,
                                "base_price": price_raw,
                            },
                        }
                    )
                    continue

                try:
                    validated = CartItemCreate(
                        product_name=product,
                        brand=brand,
                        platform=platform,
                        base_price=price,
                    )
                    valid_rows.append(
                        {
                            "row_number": logical_row,
                            "product_name": validated.product_name,
                            "brand": validated.brand,
                            "platform": validated.platform,
                            "base_price": int(validated.base_price),
                        }
                    )
                except ValidationError as exc:
                    malformed_rows.append(
                        {
                            "row_number": logical_row,
                            "raw_text": " | ".join(cells),
                            "errors": [err["msg"] for err in exc.errors()],
                            "partial": {
                                "product_name": product,
                                "brand": brand,
                                "platform": platform,
                                "base_price": price_raw,
                            },
                        }
                    )

    if not valid_rows and not malformed_rows:
        warnings.append("No tabular product rows were detected in the uploaded PDF.")

    return {
        "filename": filename,
        "total_pages": total_pages,
        "valid_rows": valid_rows,
        "malformed_rows": malformed_rows,
        "warnings": warnings,
    }
