from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import ai_rules, calculations, carts, discount_rules, health, pdf_upload
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Opptra AI Discount Engine API",
    version="1.0.0",
    description="FastAPI + Neon PostgreSQL + OpenAI + PDF Cart Extraction Discount Engine.",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    detail = str(exc) if settings.environment == "development" else "Internal server error."
    return JSONResponse(status_code=500, content={"detail": detail})


app.include_router(health.router, prefix="/api/v1")
app.include_router(discount_rules.router, prefix="/api/v1")
app.include_router(pdf_upload.router, prefix="/api/v1")
app.include_router(carts.router, prefix="/api/v1")
app.include_router(calculations.router, prefix="/api/v1")
app.include_router(ai_rules.router, prefix="/api/v1")
