import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = PROJECT_ROOT / "bookwise.db"


class Settings(BaseSettings):
    database_url: str = f"sqlite:///{DEFAULT_DB.as_posix()}"
    groq_api_key: str | None = None
    google_books_api_key: str | None = None
    secret_key: str = "change-me"

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    def model_post_init(self, __context) -> None:
        # Vercel's native Storage > Postgres injects POSTGRES_URL (no DATABASE_URL),
        # and uses the "postgres://" scheme which SQLAlchemy 2.0 no longer accepts.
        vercel_postgres_url = os.getenv("POSTGRES_URL")
        if vercel_postgres_url and self.database_url.startswith("sqlite"):
            self.database_url = vercel_postgres_url.replace("postgres://", "postgresql://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
