from fastapi import HTTPException, status


def validate_pdf_upload(filename: str | None, content_type: str | None, payload: bytes, max_bytes: int) -> None:
    if not filename or not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file extension. Only .pdf files are accepted.",
        )
    if content_type and content_type not in ("application/pdf", "application/x-pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MIME type '{content_type}'. Expected application/pdf.",
        )
    if len(payload) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded PDF file is empty.")
    if len(payload) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"PDF file exceeds maximum allowed size of {max_bytes // (1024 * 1024)} MB.",
        )
    if not payload.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file signature. Uploaded file does not start with %PDF-.",
        )
