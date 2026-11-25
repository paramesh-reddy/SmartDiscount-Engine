from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import get_settings

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "service": "opptra-discount-engine-fastapi",
        "storage": "postgresql" if settings.database_url else "unconfigured",
        "ai_configured": bool(settings.openai_api_key and settings.openai_api_key != "your_openai_api_key"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
