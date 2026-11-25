from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    frontend_url: str = "http://localhost:5173"
    environment: str = "development"
    max_pdf_bytes: int = 5 * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        origins = [o.strip() for o in self.frontend_url.split(",") if o.strip()]
        for local in ("http://localhost:5173", "http://localhost:3000"):
            if local not in origins:
                origins.append(local)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
