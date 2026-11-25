from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _normalize_db_url(raw_url: str) -> str:
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    return raw_url


settings = get_settings()
_db_url = _normalize_db_url(settings.database_url) if settings.database_url else None

engine = (
    create_engine(
        _db_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )
    if _db_url
    else None
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured. Set Neon PostgreSQL DATABASE_URL in environment.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
